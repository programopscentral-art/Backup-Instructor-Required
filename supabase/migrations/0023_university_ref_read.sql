-- Universities are reference/lookup data — the NAME must be readable by anyone
-- working a ticket (CMs, instructors, HOD), not only admin/HOD and the campus's
-- own staff. Previously universities_select = can_see_university(id), so a CM or
-- instructor saw a BLANK university on the ticket (the joined name RLS-filtered).
-- The real per-campus scoping stays on tickets / university_staff / instructors.
drop policy if exists universities_select on public.universities;
create policy universities_select on public.universities for select to authenticated
  using (true);
