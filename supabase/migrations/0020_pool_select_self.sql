-- The pool SELECT policy is admin/CM-scoped. Also let a user see their OWN pool
-- entry (matched by email) so the instructor "My Assignments" portal can find it.
drop policy if exists backup_instructor_pool_select on public.backup_instructor_pool;
create policy backup_instructor_pool_select on public.backup_instructor_pool
  for select to authenticated
  using (
    public.is_admin_or_hod()
    or public.has_scope('capability_manager', 'capability', capability_id)
    or public.has_scope('cma', 'capability', capability_id)
    or lower(email) = lower((select p.email from public.profiles p where p.id = auth.uid()))
  );
