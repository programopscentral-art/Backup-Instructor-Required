-- ============================================================================
--  Invoice window + Teams reminders tied to the absent END date.
--  The offline invoice window OPENS at 4 PM IST on the ticket's absent_to date
--  and runs for +24h (the app sets invoice_due_at at the to_invoice step). From
--  that 4 PM, a cron pings the Teams channel with the full claim details, and
--  repeats every 5 hours until the backup uploads the invoice.
-- ============================================================================

alter table public.tickets add column if not exists invoice_reminder_at timestamptz;

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
      and not exists (select 1 from public.invoices i where i.ticket_id = t.id)
      and (t.invoice_reminder_at is null or t.invoice_reminder_at <= now() - interval '5 hours')
  loop
    -- Window opens at 4 PM IST on the absent end date.
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

-- Run often enough to fire promptly at 4 PM; the 5h spacing is enforced per
-- ticket by invoice_reminder_at, so a 30-min cadence yields ~5h between pings.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'invoice-reminders') then
    perform cron.schedule('invoice-reminders', '*/30 * * * *', 'select public.send_invoice_reminders()');
  end if;
end $$;
