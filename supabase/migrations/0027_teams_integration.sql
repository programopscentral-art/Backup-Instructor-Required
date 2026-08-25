-- ============================================================================
--  Microsoft Teams integration — notify ONE channel on every ticket update.
--  Event-driven & guaranteed: every lifecycle change already writes exactly one
--  ticket_events row (manual raise, Zoho intake, assign, confirm, session,
--  invoice submit/approve, HOD approve, close, cancel). An AFTER INSERT trigger
--  fires an async pg_net POST to our dispatch route, which formats an Adaptive
--  Card and posts it to the Teams channel. A retry cron re-sends anything the
--  route hasn't confirmed (teams_sent_at), giving at-least-once delivery.
--  Dormant until teams_config.enabled = true (set during activation).
-- ============================================================================

create extension if not exists pg_net;

-- Single-row config (secret + target). RLS-on with NO policies => unreadable to
-- normal users; only the SECURITY DEFINER functions and the service role touch it.
create table if not exists public.teams_config (
  id              boolean primary key default true,
  enabled         boolean not null default false,
  dispatch_url    text,     -- our /api/teams/event route
  dispatch_secret text,     -- shared with the route's TEAMS_DISPATCH_SECRET env
  constraint teams_config_one_row check (id = true)
);
alter table public.teams_config enable row level security;
insert into public.teams_config (id, enabled) values (true, false) on conflict (id) do nothing;

-- Delivery bookkeeping for at-least-once semantics.
alter table public.ticket_events add column if not exists teams_sent_at timestamptz;

-- Fire one async POST per new ticket_event (no-op while disabled).
create or replace function public.tg_ticket_event_teams()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare cfg public.teams_config;
begin
  select * into cfg from public.teams_config where id = true;
  if cfg.enabled is not true or cfg.dispatch_url is null then
    return new;
  end if;
  perform net.http_post(
    url     := cfg.dispatch_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-teams-secret', coalesce(cfg.dispatch_secret, '')),
    body    := jsonb_build_object('event_id', new.id)
  );
  return new;
end;
$$;
drop trigger if exists trg_ticket_event_teams on public.ticket_events;
create trigger trg_ticket_event_teams
  after insert on public.ticket_events
  for each row execute function public.tg_ticket_event_teams();

-- Retry: re-POST any event our route hasn't confirmed after a few minutes.
create or replace function public.retry_teams_events()
returns integer
language plpgsql security definer set search_path = public
as $$
declare cfg public.teams_config; n int := 0; r record;
begin
  select * into cfg from public.teams_config where id = true;
  if cfg.enabled is not true or cfg.dispatch_url is null then return 0; end if;
  for r in
    select id from public.ticket_events
    where teams_sent_at is null and created_at < now() - interval '3 minutes'
    order by created_at asc
    limit 50
  loop
    perform net.http_post(
      url     := cfg.dispatch_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-teams-secret', coalesce(cfg.dispatch_secret, '')),
      body    := jsonb_build_object('event_id', r.id)
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'retry-teams-events') then
    perform cron.schedule('retry-teams-events', '*/5 * * * *', 'select public.retry_teams_events()');
  end if;
end $$;

-- The 24h SLA cron now writes a ticket_event when it red-flags a ticket, so red
-- flags flow to Teams through the same path (behaviour otherwise unchanged).
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
    returning t.id, t.assigned_backup_id
  ),
  bump as (
    select assigned_backup_id, count(*)::int cnt
    from upd where assigned_backup_id is not null group by assigned_backup_id
  ),
  applied as (
    update public.backup_instructor_pool bp
       set red_flags = bp.red_flags + b.cnt
      from bump b where bp.id = b.assigned_backup_id
    returning 1
  ),
  ev as (
    insert into public.ticket_events (ticket_id, actor_name, from_status, to_status, note)
    select id, 'SLA monitor', 'invoice_pending', 'invoice_pending',
           'Red flag — invoice overdue (24-hour window passed).'
    from upd
    returning 1
  )
  select count(*) into n from upd;
  return n;
end;
$$;
