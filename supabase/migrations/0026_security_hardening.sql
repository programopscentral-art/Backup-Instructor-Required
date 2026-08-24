-- ============================================================================
--  Security hardening (from an end-to-end audit). RLS/storage-only; no product
--  behaviour changes for legitimate users — these close paths reachable by a
--  crafted request against the raw Supabase client.
-- ============================================================================

-- Helper: extract the ticket id from an invoices-bucket object path
-- (paths are "<ticketId>/<uuid>-<filename>"). Returns null for non-uuid paths
-- so the cast can never error inside a storage policy.
create or replace function public.invoice_object_ticket(objname text)
returns uuid
language sql stable
security definer set search_path = storage, public
as $$
  select case
    when (storage.foldername(objname))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then ((storage.foldername(objname))[1])::uuid
    else null
  end;
$$;

-- #1 HIGH — charge slips were readable by ANY authenticated user. Scope SELECT
-- to admin/HOD or someone who can see that ticket (same rule as invoices_select).
drop policy if exists invoices_obj_select on storage.objects;
create policy invoices_obj_select on storage.objects for select to authenticated
  using (
    bucket_id = 'invoices'
    and (public.is_admin_or_hod() or public.can_see_ticket(public.invoice_object_ticket(name)))
  );

-- #3 MEDIUM — the bucket was writable by any authenticated user. Restrict INSERT
-- to admin/HOD or the assigned backup for that ticket's folder (mirrors who may
-- file the invoice), and cap size / MIME on the bucket itself.
drop policy if exists invoices_obj_insert on storage.objects;
create policy invoices_obj_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'invoices'
    and (
      public.is_admin_or_hod()
      or exists (
        select 1
        from public.tickets t
        join public.backup_instructor_pool bp on bp.id = t.assigned_backup_id
        join public.profiles p on lower(p.email) = lower(bp.email)
        where t.id = public.invoice_object_ticket(storage.objects.name) and p.id = auth.uid()
      )
    )
  );

update storage.buckets
   set file_size_limit = 15728640,  -- 15 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','application/pdf']
 where id = 'invoices';

-- #4 MEDIUM — the 3-red-flag upload lock lived only in the server action and was
-- bypassable via the raw client. Enforce upload_blocked = false at the DB for the
-- backup-instructor branch of both invoice INSERT and UPDATE (admin/HOD override).
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check (
    public.is_admin_or_hod()
    or exists (
      select 1
      from public.tickets t
      join public.backup_instructor_pool bp on bp.id = t.assigned_backup_id
      join public.profiles p on lower(p.email) = lower(bp.email)
      where t.id = ticket_id and p.id = auth.uid() and bp.upload_blocked = false
    )
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated
  using (
    public.is_admin_or_hod()
    or (
      submitted_by = auth.uid()
      and status::text in ('submitted','returned')
      and exists (
        select 1
        from public.tickets t
        join public.backup_instructor_pool bp on bp.id = t.assigned_backup_id
        join public.profiles p on lower(p.email) = lower(bp.email)
        where t.id = invoices.ticket_id and p.id = auth.uid() and bp.upload_blocked = false
      )
    )
  )
  with check (
    public.is_admin_or_hod()
    or (submitted_by = auth.uid() and status::text = 'submitted')
  );

-- #9 LOW — audit-trail forgery: any ticket viewer could INSERT a ticket_event
-- attributed to someone else. Require the actor to be the caller (or system-null).
drop policy if exists ticket_events_insert on public.ticket_events;
create policy ticket_events_insert on public.ticket_events for insert to authenticated
  with check (public.can_see_ticket(ticket_id) and (actor_id = auth.uid() or actor_id is null));

-- #9 LOW — notification spoofing: any user could INSERT a notification for anyone
-- (with check TRUE). The app's notify() writes via the service-role client (which
-- bypasses RLS), so restrict the authenticated policy to admin/HOD only.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.is_admin_or_hod());

-- #8 INFO — reason-list pollution: restrict to the roles that raise tickets.
drop policy if exists ticket_reasons_insert on public.ticket_reasons;
create policy ticket_reasons_insert on public.ticket_reasons for insert to authenticated
  with check (public.is_admin_or_hod() or public.has_role('university_staff'));
