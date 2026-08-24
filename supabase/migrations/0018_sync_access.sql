-- ============================================================================
--  Re-checkable access provisioning.
--  provision_user_access(uid,email) applies all directory/grant-based roles
--  (idempotent). handle_new_user calls it on signup; sync_my_access() lets a
--  signed-in user (who logged in before their email was on file) self-provision.
-- ============================================================================

create or replace function public.provision_user_access(p_user uuid, p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_instructor boolean;
begin
  -- pre-authorized admin grants
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  select p_user, g.role, g.scope_type, g.scope_id, g.granted_by
  from public.access_grants g
  where lower(g.email) = lower(p_email) and g.applied_at is null
  on conflict (user_id, role, scope_type, scope_id) do nothing;
  update public.access_grants set applied_at = now()
   where lower(email) = lower(p_email) and applied_at is null;

  -- university staff (scoped to campus)
  insert into public.role_assignments (user_id, role, scope_type, scope_id)
  select distinct p_user, 'university_staff', 'university', us.university_id
  from public.university_staff us
  where lower(us.email) = lower(p_email) and us.university_id is not null and us.status = 'active'
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  -- capability managers (scoped to capability)
  insert into public.role_assignments (user_id, role, scope_type, scope_id)
  select distinct p_user, 'capability_manager', 'capability', c.id
  from public.capabilities c
  where lower(c.manager_email) = lower(p_email) and c.status = 'active'
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  -- instructor (directory or backup pool)
  v_is_instructor :=
       exists (select 1 from public.instructors where lower(email) = lower(p_email) and status = 'active')
    or exists (select 1 from public.backup_instructor_pool where lower(email) = lower(p_email) and status = 'active');
  if v_is_instructor and not exists (
    select 1 from public.role_assignments where user_id = p_user and role = 'instructor' and scope_type = 'global'
  ) then
    insert into public.role_assignments (user_id, role, scope_type, scope_id)
    values (p_user, 'instructor', 'global', null);
  end if;

  if exists (select 1 from public.role_assignments where user_id = p_user) then
    update public.profiles set status = 'active', updated_at = now() where id = p_user;
  end if;
end;
$$;

-- signup trigger now delegates to the shared function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'pending'
  )
  on conflict (id) do nothing;

  perform public.provision_user_access(new.id, new.email);
  return new;
end;
$$;

-- self-serve re-check for the current user
create or replace function public.sync_my_access()
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then return false; end if;
  perform public.provision_user_access(auth.uid(), v_email);
  return exists (select 1 from public.role_assignments where user_id = auth.uid());
end;
$$;
grant execute on function public.sync_my_access() to authenticated;
