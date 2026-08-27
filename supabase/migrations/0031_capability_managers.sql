-- ============================================================================
--  Multiple Capability Managers per capability (subject vertical).
--  A capability can now have 2–3+ managers. `capabilities.manager_*` stays as
--  the "lead" (single-value displays); `capability_managers` is the authoritative
--  full list used for notifications, @mentions, and role provisioning. Admin
--  adds/removes CMs live in Directories → Capability Managers.
-- ============================================================================

create table if not exists public.capability_managers (
  id            uuid primary key default gen_random_uuid(),
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  name          text not null,
  email         text not null,
  user_id       uuid references public.profiles(id),
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists capability_managers_uniq on public.capability_managers(capability_id, lower(email));
create index if not exists capability_managers_email_idx on public.capability_managers(lower(email));
create index if not exists capability_managers_cap_idx on public.capability_managers(capability_id);

alter table public.capability_managers enable row level security;

-- Readable to any authed user (reference data, like capabilities); only admin/HOD edit.
drop policy if exists capability_managers_select on public.capability_managers;
create policy capability_managers_select on public.capability_managers for select to authenticated using (true);
drop policy if exists capability_managers_modify on public.capability_managers;
create policy capability_managers_modify on public.capability_managers for all to authenticated
  using (public.is_admin_or_hod()) with check (public.is_admin_or_hod());

-- Realtime for the directory table live updates.
do $$ begin
  execute 'alter publication supabase_realtime add table public.capability_managers';
exception when duplicate_object then null; end $$;

-- Provisioning now grants capability_manager also from capability_managers (a
-- CM whose email is on the list, not only the capability's lead manager_email).
create or replace function public.provision_user_access(p_user uuid, p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role     public.app_role;
  v_scope    public.scope_kind;
  v_scope_id uuid;
  v_grantor  uuid;
  v_prio text[] := array['admin','hod','capability_manager','cma','university_staff','instructor'];
begin
  -- (A) Apply the single highest-priority pending admin grant as the user's role.
  select g.role, g.scope_type, g.scope_id, g.granted_by
    into v_role, v_scope, v_scope_id, v_grantor
  from public.access_grants g
  where lower(g.email) = lower(p_email) and g.applied_at is null
  order by array_position(v_prio, g.role::text)
  limit 1;

  if v_role is not null then
    insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
    values (p_user, v_role, v_scope, v_scope_id, v_grantor)
    on conflict (user_id) do update
      set role = excluded.role, scope_type = excluded.scope_type,
          scope_id = excluded.scope_id, granted_by = excluded.granted_by;
    update public.access_grants set applied_at = now()
     where lower(email) = lower(p_email) and applied_at is null;
  end if;

  -- (B) A manual/admin grant is authoritative — keep it, never auto-downgrade.
  if exists (select 1 from public.role_assignments
             where user_id = p_user and granted_by is not null) then
    update public.profiles set status = 'active', updated_at = now() where id = p_user;
    return;
  end if;

  -- (C) No manual grant → derive the SINGLE best directory role by priority.
  v_role := null; v_scope := null; v_scope_id := null;

  -- capability_manager: the capability's lead OR any capability_managers row.
  select 'capability_manager'::public.app_role, 'capability'::public.scope_kind, c.id
    into v_role, v_scope, v_scope_id
  from public.capabilities c
  where lower(c.manager_email) = lower(p_email) and c.status = 'active'
  limit 1;

  if v_role is null then
    select 'capability_manager'::public.app_role, 'capability'::public.scope_kind, cm.capability_id
      into v_role, v_scope, v_scope_id
    from public.capability_managers cm
    where lower(cm.email) = lower(p_email) and cm.status = 'active'
    limit 1;
  end if;

  if v_role is null then
    select 'university_staff'::public.app_role, 'university'::public.scope_kind, us.university_id
      into v_role, v_scope, v_scope_id
    from public.university_staff us
    where lower(us.email) = lower(p_email) and us.university_id is not null and us.status = 'active'
    limit 1;
  end if;

  if v_role is null then
    if exists (select 1 from public.instructors where lower(email) = lower(p_email) and status = 'active')
       or exists (select 1 from public.backup_instructor_pool where lower(email) = lower(p_email) and status = 'active') then
      v_role := 'instructor'::public.app_role; v_scope := 'global'::public.scope_kind; v_scope_id := null;
    end if;
  end if;

  if v_role is not null then
    insert into public.role_assignments (user_id, role, scope_type, scope_id)
    values (p_user, v_role, v_scope, v_scope_id)
    on conflict (user_id) do update
      set role = excluded.role, scope_type = excluded.scope_type,
          scope_id = excluded.scope_id, granted_by = null;
    update public.profiles set status = 'active', updated_at = now() where id = p_user;
  end if;
end;
$$;
