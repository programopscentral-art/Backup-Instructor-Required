-- Fix: role/scope literals must be cast to their enum types (app_role, scope_kind).
create or replace function public.provision_user_access(p_user uuid, p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_instructor boolean;
begin
  -- pre-authorized admin grants (already typed in access_grants)
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  select p_user, g.role, g.scope_type, g.scope_id, g.granted_by
  from public.access_grants g
  where lower(g.email) = lower(p_email) and g.applied_at is null
  on conflict (user_id, role, scope_type, scope_id) do nothing;
  update public.access_grants set applied_at = now()
   where lower(email) = lower(p_email) and applied_at is null;

  -- university staff (scoped to campus)
  insert into public.role_assignments (user_id, role, scope_type, scope_id)
  select distinct p_user, 'university_staff'::public.app_role, 'university'::public.scope_kind, us.university_id
  from public.university_staff us
  where lower(us.email) = lower(p_email) and us.university_id is not null and us.status = 'active'
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  -- capability managers (scoped to capability)
  insert into public.role_assignments (user_id, role, scope_type, scope_id)
  select distinct p_user, 'capability_manager'::public.app_role, 'capability'::public.scope_kind, c.id
  from public.capabilities c
  where lower(c.manager_email) = lower(p_email) and c.status = 'active'
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  -- instructor (directory or backup pool)
  v_is_instructor :=
       exists (select 1 from public.instructors where lower(email) = lower(p_email) and status = 'active')
    or exists (select 1 from public.backup_instructor_pool where lower(email) = lower(p_email) and status = 'active');
  if v_is_instructor and not exists (
    select 1 from public.role_assignments
    where user_id = p_user and role = 'instructor'::public.app_role and scope_type = 'global'::public.scope_kind
  ) then
    insert into public.role_assignments (user_id, role, scope_type, scope_id)
    values (p_user, 'instructor'::public.app_role, 'global'::public.scope_kind, null);
  end if;

  if exists (select 1 from public.role_assignments where user_id = p_user) then
    update public.profiles set status = 'active', updated_at = now() where id = p_user;
  end if;
end;
$$;
