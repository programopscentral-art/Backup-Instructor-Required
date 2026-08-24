-- ============================================================================
--  RLS hardening (found via end-to-end audit)
--  1. tickets_select was a stale inline copy that missed the assigned-backup
--     branch → instructors couldn't see their assigned tickets. Use can_see_ticket
--     (single source of truth, already includes the backup-by-email branch).
--  2. tickets_update let a CM drive the WHOLE lifecycle (self-confirm/approve/close).
--     Restrict CMs to their legitimate stages (raised / backup_assigned); admins full.
--  3. invoices_update let the submitter (the backup instructor) self-approve their
--     own claim. Restrict status changes to admin/HOD; submitter may only edit while
--     still 'submitted'.
-- ============================================================================

-- 1. Tickets are visible to whoever can_see_ticket() allows (incl. assigned backup)
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (public.can_see_ticket(id));

-- 2. Only admins/HOD advance beyond assignment; CMs are boxed into raised/backup_assigned
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (
    public.is_admin_or_hod()
    or (
      (public.has_scope('capability_manager', 'capability', capability_id)
       or public.has_scope('cma', 'capability', capability_id))
      and status in ('raised', 'backup_assigned')
    )
  )
  with check (
    public.is_admin_or_hod()
    or (
      (public.has_scope('capability_manager', 'capability', capability_id)
       or public.has_scope('cma', 'capability', capability_id))
      and status in ('raised', 'backup_assigned')
    )
  );

-- 2b. Invoice INSERT was can_see_ticket (raiser + any campus staff could file
--     someone else's claim). Restrict to admin/HOD, the subject's CM, or the
--     assigned backup instructor (by email).
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check (
    public.is_admin_or_hod()
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_id and (
        public.has_scope('capability_manager', 'capability', t.capability_id)
        or public.has_scope('cma', 'capability', t.capability_id)
        or exists (
          select 1 from public.backup_instructor_pool bp
          join public.profiles p on lower(p.email) = lower(bp.email)
          where bp.id = t.assigned_backup_id and p.id = auth.uid()
        )
      )
    )
  );

-- 3. Submitter can't self-approve. They may edit a 'submitted' claim or re-file a
--    'returned' one, but can only ever set it back to 'submitted' (never approve).
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated
  using (public.is_admin_or_hod() or (submitted_by = auth.uid() and status in ('submitted', 'returned')))
  with check (public.is_admin_or_hod() or (submitted_by = auth.uid() and status = 'submitted'));
