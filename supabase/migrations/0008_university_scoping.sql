-- ============================================================================
--  Scope directory data by university.
--  University staff must see ONLY their own campus's universities / staff /
--  instructors. Admin & HOD see everything. Capability managers see their
--  vertical's backup pool. Subjects & capabilities stay global reference
--  (needed to raise tickets).
-- ============================================================================

-- True if the current user may see rows belonging to `univ_id`.
create or replace function public.can_see_university(univ_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_admin_or_hod()
    or (
      univ_id is not null and exists (
        select 1 from public.role_assignments
        where user_id = auth.uid()
          and scope_type = 'university'
          and scope_id = univ_id
      )
    );
$$;
grant execute on function public.can_see_university(uuid) to authenticated;

-- Universities: own campus only for scoped users.
drop policy if exists universities_select on public.universities;
create policy universities_select on public.universities for select to authenticated
  using (public.can_see_university(id));

-- University staff directory: own campus only.
drop policy if exists university_staff_select on public.university_staff;
create policy university_staff_select on public.university_staff for select to authenticated
  using (public.can_see_university(university_id));

-- Instructors: own campus only.
drop policy if exists instructors_select on public.instructors;
create policy instructors_select on public.instructors for select to authenticated
  using (public.can_see_university(university_id));

-- Backup pool: admin/hod + the capability's manager.
drop policy if exists backup_instructor_pool_select on public.backup_instructor_pool;
create policy backup_instructor_pool_select on public.backup_instructor_pool for select to authenticated
  using (
    public.is_admin_or_hod()
    or public.has_scope('capability_manager', 'capability', capability_id)
    or public.has_scope('cma', 'capability', capability_id)
  );

-- Harden ticket creation: staff may only raise tickets for THEIR university.
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated with check (
  public.is_admin_or_hod()
  or (raised_by = auth.uid() and public.has_scope('university_staff', 'university', university_id))
);
