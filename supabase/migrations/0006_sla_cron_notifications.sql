-- ============================================================================
--  Active 24-hour SLA (pg_cron) + notifications.
--  A scheduled DB job flags overdue invoice tickets even when nobody is looking.
-- ============================================================================

-- Persisted red flag (set by the cron, not just computed on read).
alter table public.tickets add column if not exists red_flag boolean not null default false;
alter table public.tickets add column if not exists red_flag_at timestamptz;

-- Flags invoice_pending tickets whose 24h window lapsed with no invoice filed.
create or replace function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  with upd as (
    update public.tickets t
       set red_flag = true, red_flag_at = now()
     where t.status = 'invoice_pending'
       and t.red_flag = false
       and t.invoice_due_at is not null
       and t.invoice_due_at < now()
       and not exists (select 1 from public.invoices i where i.ticket_id = t.id)
    returning t.id
  )
  select count(*) into n from upd;
  return n;
end;
$$;
grant execute on function public.mark_overdue_invoices() to authenticated;

-- Schedule it every 15 minutes via pg_cron (best-effort — ignore if unavailable).
do $cron$
begin
  create extension if not exists pg_cron;
exception when others then null;
end $cron$;

do $cron$
begin
  perform cron.unschedule('niat-mark-overdue');
exception when others then null;
end $cron$;

do $cron$
begin
  perform cron.schedule('niat-mark-overdue', '*/15 * * * *', 'select public.mark_overdue_invoices();');
exception when others then null;
end $cron$;

-- ============================================================================
--  Notifications (in-app; email sent by the app when RESEND_API_KEY is set)
-- ============================================================================
create table if not exists public.notifications (
  id                uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  recipient_email   text,
  type              text,
  title             text not null,
  body              text,
  ticket_id         uuid references public.tickets(id) on delete cascade,
  read              boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(recipient_user_id);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid() or public.is_admin_or_hod());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (true);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.notifications';
  exception when duplicate_object then null;
  end;
end $$;
