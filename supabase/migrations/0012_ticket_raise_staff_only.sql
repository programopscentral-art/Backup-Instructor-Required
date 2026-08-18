-- ============================================================================
--  Raising absence tickets is a University Ops (staff) privilege only.
--  Instructors — even when scoped to a university — cannot raise tickets;
--  they must ask their university staff/Ops team. Admin/HOD may raise anywhere.
-- ============================================================================
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated with check (
  public.is_admin_or_hod()
  or (raised_by = auth.uid() and public.has_scope('university_staff', 'university', university_id))
);
