-- ============================================================================
--  Email-based auto-login for directory people (like the backup pool):
--    university_staff.email  → role university_staff (scoped to their campus)
--    capabilities.manager_email → role capability_manager (scoped to that capability)
--    instructors.email / backup_instructor_pool.email → role instructor
--  If the person's email is on file, their first Google login auto-provisions the
--  right role and activates them — no manual grant needed.
-- ============================================================================

alter table public.instructors  add column if not exists email text;
alter table public.capabilities add column if not exists manager_email text;
create index if not exists instructors_email_idx on public.instructors(lower(email));
create index if not exists capabilities_manager_email_idx on public.capabilities(lower(manager_email));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_has_role boolean := false;
  v_is_instructor boolean := false;
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'pending'
  )
  on conflict (id) do nothing;

  -- 1) pre-authorized admin grants
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  select new.id, g.role, g.scope_type, g.scope_id, g.granted_by
  from public.access_grants g
  where lower(g.email) = lower(new.email) and g.applied_at is null
  on conflict (user_id, role, scope_type, scope_id) do nothing;
  update public.access_grants set applied_at = now()
   where lower(email) = lower(new.email) and applied_at is null;

  -- 2) university staff → scoped to their campus(es)
  insert into public.role_assignments (user_id, role, scope_type, scope_id)
  select distinct new.id, 'university_staff', 'university', us.university_id
  from public.university_staff us
  where lower(us.email) = lower(new.email) and us.university_id is not null and us.status = 'active'
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  -- 3) capability managers → scoped to their capability(ies)
  insert into public.role_assignments (user_id, role, scope_type, scope_id)
  select distinct new.id, 'capability_manager', 'capability', c.id
  from public.capabilities c
  where lower(c.manager_email) = lower(new.email) and c.status = 'active'
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  -- 4) instructors (directory OR backup pool) → instructor (once)
  v_is_instructor :=
       exists (select 1 from public.instructors where lower(email) = lower(new.email) and status = 'active')
    or exists (select 1 from public.backup_instructor_pool where lower(email) = lower(new.email) and status = 'active');
  if v_is_instructor and not exists (
    select 1 from public.role_assignments where user_id = new.id and role = 'instructor' and scope_type = 'global'
  ) then
    insert into public.role_assignments (user_id, role, scope_type, scope_id)
    values (new.id, 'instructor', 'global', null);
  end if;

  select exists(select 1 from public.role_assignments where user_id = new.id) into v_has_role;
  if v_has_role then
    update public.profiles set status = 'active', updated_at = now() where id = new.id;
  end if;

  return new;
end;
$$;
