-- ============================================================================
--  Fix: anyone assigned to a university (staff OR instructor scoped to it) may
--  raise a ticket FOR THAT university. Previously only 'university_staff' could,
--  so a university-scoped 'instructor' hit an RLS violation. Still scoped: a
--  user can only raise for a university they belong to; admin/hod raise anywhere.
-- ============================================================================
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated with check (
  public.is_admin_or_hod()
  or (raised_by = auth.uid() and public.can_see_university(university_id))
);
