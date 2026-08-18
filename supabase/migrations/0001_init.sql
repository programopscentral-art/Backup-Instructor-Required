-- ============================================================================
--  NIAT Backup Instructor Platform — initial schema
--  Foundation: identity, roles (role × scope), and the core reference tables.
--  Single source of truth = this database. Google Sheets are seed-only.
-- ============================================================================

-- ---- Extensions ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---- Enums -----------------------------------------------------------------
do $$ begin
  create type public.app_role as enum
    ('admin','hod','capability_manager','cma','university_staff','instructor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scope_kind as enum ('global','university','capability');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_status as enum ('pending','active','inactive');
exception when duplicate_object then null; end $$;

-- ============================================================================
--  Reference / directory tables (scope targets)
-- ============================================================================
create table if not exists public.universities (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  city        text,
  state       text,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

create table if not exists public.capabilities (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,        -- e.g. "Data Structures & Algorithms"
  manager_user_id  uuid,                         -- FK added after profiles exists
  status           text not null default 'active',
  created_at       timestamptz not null default now()
);

create table if not exists public.subjects (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,               -- display label as seen on sheet
  normalized_name  text not null,               -- canonical routing key
  capability_id    uuid references public.capabilities(id) on delete set null,
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  unique (normalized_name)
);

-- ============================================================================
--  Identity
-- ============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  status      public.profile_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- capabilities.manager_user_id -> profiles
do $$ begin
  alter table public.capabilities
    add constraint capabilities_manager_fk
    foreign key (manager_user_id) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ============================================================================
--  Roles: role × scope, many-to-many.  A person can hold several roles.
-- ============================================================================
create table if not exists public.role_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.app_role not null,
  scope_type  public.scope_kind not null default 'global',
  scope_id    uuid,                              -- university.id or capability.id, null for global
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  unique (user_id, role, scope_type, scope_id)
);
create index if not exists role_assignments_user_idx on public.role_assignments(user_id);
create index if not exists role_assignments_role_idx on public.role_assignments(role);

-- ============================================================================
--  Pre-authorization by email: Admin grants access BEFORE first login.
--  Applied automatically when that email first signs in (see trigger below).
-- ============================================================================
create table if not exists public.access_grants (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        public.app_role not null,
  scope_type  public.scope_kind not null default 'global',
  scope_id    uuid,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  applied_at  timestamptz
);
create index if not exists access_grants_email_idx on public.access_grants(lower(email));

-- ============================================================================
--  New-user handler: create profile, apply any email grants, activate if any.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_has_role boolean := false;
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'pending'
  )
  on conflict (id) do nothing;

  -- apply pre-authorized grants for this email
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  select new.id, g.role, g.scope_type, g.scope_id, g.granted_by
  from public.access_grants g
  where lower(g.email) = lower(new.email) and g.applied_at is null
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  update public.access_grants
     set applied_at = now()
   where lower(email) = lower(new.email) and applied_at is null;

  select exists(select 1 from public.role_assignments where user_id = new.id)
    into v_has_role;

  if v_has_role then
    update public.profiles set status = 'active', updated_at = now() where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  Authorization helpers (SECURITY DEFINER => bypass RLS, avoid recursion)
-- ============================================================================
create or replace function public.has_role(target public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_assignments
    where user_id = auth.uid() and role = target
  );
$$;

create or replace function public.is_admin_or_hod()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_assignments
    where user_id = auth.uid() and role in ('admin','hod')
  );
$$;

grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_admin_or_hod() to authenticated;

-- ============================================================================
--  Row Level Security
-- ============================================================================
alter table public.profiles          enable row level security;
alter table public.role_assignments  enable row level security;
alter table public.access_grants     enable row level security;
alter table public.universities      enable row level security;
alter table public.capabilities      enable row level security;
alter table public.subjects          enable row level security;

-- profiles: read own or (admin/hod) all; writes go through admin/hod only
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin_or_hod());

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update to authenticated
  using (public.is_admin_or_hod()) with check (public.is_admin_or_hod());

-- role_assignments: read own or all (admin/hod); write admin/hod only
drop policy if exists role_assignments_select on public.role_assignments;
create policy role_assignments_select on public.role_assignments for select to authenticated
  using (user_id = auth.uid() or public.is_admin_or_hod());

drop policy if exists role_assignments_modify on public.role_assignments;
create policy role_assignments_modify on public.role_assignments for all to authenticated
  using (public.is_admin_or_hod()) with check (public.is_admin_or_hod());

-- access_grants: admin/hod only
drop policy if exists access_grants_all on public.access_grants;
create policy access_grants_all on public.access_grants for all to authenticated
  using (public.is_admin_or_hod()) with check (public.is_admin_or_hod());

-- reference tables: any authenticated user reads; admin/hod writes
do $$
declare t text;
begin
  foreach t in array array['universities','capabilities','subjects'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_modify on public.%I', t, t);
    execute format('create policy %I_modify on public.%I for all to authenticated using (public.is_admin_or_hod()) with check (public.is_admin_or_hod())', t, t);
  end loop;
end $$;
