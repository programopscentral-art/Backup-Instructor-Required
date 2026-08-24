-- ============================================================================
--  ONE PERSON = ONE ROLE  (separation of duties by construction)
--
--  Product rule: a single login (email → one profiles row) holds at most ONE
--  role_assignment. This makes self-approval / dual-hat impossible structurally
--  rather than by runtime checks. Granting a new role REPLACES the old one.
--
--  Precedence when provisioning (highest wins, exactly one is kept):
--    1. An admin's explicit grant (access_grants / manual role_assignment,
--       granted_by not null) is AUTHORITATIVE and is never auto-downgraded.
--    2. Otherwise the single highest-priority directory match:
--         capability_manager > university_staff > instructor
--       (priority mirrors ROLE_PRIORITY in src/lib/auth/roles.ts).
-- ============================================================================

-- 1. Collapse any user to a single assignment (keep highest-priority; prefer a
--    manual/admin grant over an auto one). Live data is already 1-per-user, so
--    this is a defensive no-op, but it guarantees the constraint below can apply.
with ranked as (
  select ctid,
         row_number() over (
           partition by user_id
           order by array_position(
                      array['admin','hod','capability_manager','cma','university_staff','instructor']::text[],
                      role::text),
                    (granted_by is null)   -- false (manual) sorts before true (auto)
         ) as rn
  from public.role_assignments
)
delete from public.role_assignments ra
using ranked r
where ra.ctid = r.ctid and r.rn > 1;

-- 2. Structural guarantee: at most one role per user.
alter table public.role_assignments
  drop constraint if exists role_assignments_one_per_user;
alter table public.role_assignments
  add constraint role_assignments_one_per_user unique (user_id);

-- 3. Single-role provisioning that REPLACES (never accumulates).
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

  -- (B) A manual/admin grant (granted_by not null) is authoritative — keep it,
  --     never auto-downgrade on re-login / re-sync.
  if exists (select 1 from public.role_assignments
             where user_id = p_user and granted_by is not null) then
    update public.profiles set status = 'active', updated_at = now() where id = p_user;
    return;
  end if;

  -- (C) No manual grant → derive the SINGLE best directory role by priority.
  v_role := null; v_scope := null; v_scope_id := null;

  select 'capability_manager'::public.app_role, 'capability'::public.scope_kind, c.id
    into v_role, v_scope, v_scope_id
  from public.capabilities c
  where lower(c.manager_email) = lower(p_email) and c.status = 'active'
  limit 1;

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
