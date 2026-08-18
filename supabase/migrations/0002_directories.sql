-- ============================================================================
--  Directory tables (seeded once from the reference sheets, then UI-managed).
--  University staff, instructors, and the capability-manager backup pool.
-- ============================================================================

-- ---- University staff (sheet: "old") ---------------------------------------
create table if not exists public.university_staff (
  id               uuid primary key default gen_random_uuid(),
  employee_id      text,
  full_name        text not null,
  university_id    uuid references public.universities(id) on delete set null,
  personal_contact text,
  office_contact   text,
  email            text,
  role             text,                       -- BOA / PMA / PM / COS / CM ...
  status           text not null default 'active',
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists university_staff_univ_idx on public.university_staff(university_id);
create index if not exists university_staff_email_idx on public.university_staff(lower(email));

-- ---- Instructors (sheet: "Finalised instructor count sem-m") ----------------
create table if not exists public.instructors (
  id                uuid primary key default gen_random_uuid(),
  university_id     uuid references public.universities(id) on delete set null,
  subject_id        uuid references public.subjects(id) on delete set null,
  instructor_name   text not null,
  emp_id            text,
  instructor_type   text,                      -- Old / New (normalized)
  deployment_status text,                      -- Deployed / Yet to be Deployed
  workload          text,
  mentor_name       text,
  mentor_emp_id     text,
  remarks           text,
  status            text not null default 'active',
  created_at        timestamptz not null default now()
);
create index if not exists instructors_univ_idx on public.instructors(university_id);
create index if not exists instructors_subject_idx on public.instructors(subject_id);

-- ---- Backup instructor pool (managed by capability managers) ----------------
create table if not exists public.backup_instructor_pool (
  id               uuid primary key default gen_random_uuid(),
  instructor_id    uuid references public.instructors(id) on delete set null,
  instructor_name  text not null,
  emp_id           text,
  capability_id    uuid references public.capabilities(id) on delete set null,
  manager_user_id  uuid references public.profiles(id) on delete set null,
  availability_mode text not null default 'both',  -- online / offline / both
  current_status    text not null default 'available', -- available / assigned / on_leave
  status           text not null default 'active',
  created_at       timestamptz not null default now()
);
create index if not exists backup_pool_capability_idx on public.backup_instructor_pool(capability_id);
create index if not exists backup_pool_manager_idx on public.backup_instructor_pool(manager_user_id);

-- ============================================================================
--  RLS: any authenticated user reads; admin/hod writes (CM scope comes later).
-- ============================================================================
alter table public.university_staff        enable row level security;
alter table public.instructors             enable row level security;
alter table public.backup_instructor_pool  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['university_staff','instructors','backup_instructor_pool'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_modify on public.%I', t, t);
    execute format('create policy %I_modify on public.%I for all to authenticated using (public.is_admin_or_hod()) with check (public.is_admin_or_hod())', t, t);
  end loop;
end $$;

-- ============================================================================
--  Realtime: publish directory + reference tables for instant UI updates.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'universities','capabilities','subjects',
    'university_staff','instructors','backup_instructor_pool',
    'role_assignments','access_grants','profiles'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
