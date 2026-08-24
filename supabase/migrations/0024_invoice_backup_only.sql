-- ============================================================================
--  Invoices are the backup instructor's job, not the Capability Manager's.
--  0021 let the subject's CM INSERT an invoice; product rule is that ONLY the
--  assigned backup instructor (by email) files the offline claim, with Ops/HOD
--  as a superuser override. Drop the CM branch so a CM can't file (or, via the
--  raw client, insert) an invoice — they only assign the backup and then watch
--  the flow read-only. invoices_update (0021) already blocks self-approval and
--  is keyed on submitted_by, so no CM row can exist to update once insert is gone.
-- ============================================================================

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check (
    public.is_admin_or_hod()
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_id and exists (
        select 1 from public.backup_instructor_pool bp
        join public.profiles p on lower(p.email) = lower(bp.email)
        where bp.id = t.assigned_backup_id and p.id = auth.uid()
      )
    )
  );
