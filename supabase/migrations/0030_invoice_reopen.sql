-- ============================================================================
--  Late-upload gate. After the 24h window closes, the backup can no longer
--  upload — an Admin/HOD must "approve" (re-open) it first. Reminders stop at
--  the deadline (no more Teams pings once the window is closed).
-- ============================================================================

alter table public.tickets add column if not exists invoice_reopened_at timestamptz;

-- Backup may INSERT an invoice only inside the open window, or after an admin
-- re-opened it (invoice_reopened_at). Admin/HOD are unaffected (superuser).
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check (
    public.is_admin_or_hod()
    or exists (
      select 1
      from public.tickets t
      join public.backup_instructor_pool bp on bp.id = t.assigned_backup_id
      join public.profiles p on lower(p.email) = lower(bp.email)
      where t.id = ticket_id
        and p.id = auth.uid()
        and bp.upload_blocked = false
        and (t.invoice_due_at is null or now() < t.invoice_due_at or t.invoice_reopened_at is not null)
    )
  );

-- Reminders fire only INSIDE the window ([4 PM open, deadline]); they stop once
-- the 24h deadline passes (and never fire again unless the row is worked).
create or replace function public.send_invoice_reminders()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  cfg public.teams_config;
  n int := 0;
  r record;
  open_at timestamptz;
begin
  select * into cfg from public.teams_config where id = true;
  if cfg.enabled is not true or cfg.dispatch_url is null then return 0; end if;

  for r in
    select t.id, t.absent_to
    from public.tickets t
    where t.status = 'invoice_pending'
      and t.mode = 'offline'
      and t.absent_to is not null
      and t.invoice_due_at is not null
      and now() < t.invoice_due_at                       -- stop after the deadline
      and not exists (select 1 from public.invoices i where i.ticket_id = t.id)
      and (t.invoice_reminder_at is null or t.invoice_reminder_at <= now() - interval '5 hours')
  loop
    open_at := (r.absent_to::date + time '16:00') at time zone 'Asia/Kolkata';
    if open_at <= now() then
      perform net.http_post(
        url     := cfg.dispatch_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-teams-secret', coalesce(cfg.dispatch_secret, '')),
        body    := jsonb_build_object('reminder', true, 'ticket_id', r.id)
      );
      update public.tickets set invoice_reminder_at = now() where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
