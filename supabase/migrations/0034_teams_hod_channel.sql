-- ============================================================================
--  Dedicated HOD-approval Teams channel.
--  The HOD does not watch the busy "Backup OS Alerts" channel, so when Ops
--  approves a claim (ticket -> ops_approved) we ALSO post a focused
--  "⏳ your approval is next" card to a SEPARATE HOD channel, @mentioning the
--  HOD, with the full claim breakdown and a button straight to the HOD
--  Approvals queue in the dashboard. The main channel keeps its normal card.
--
--  Reuses the existing event-driven pipeline (ticket_events AFTER INSERT
--  trigger -> /api/teams/event). The route decides which channel(s) a given
--  event goes to; this migration just adds the target + an independent
--  delivery flag so the HOD card retries separately from the main card.
-- ============================================================================

-- Target for the HOD channel (Power Automate Workflow URL). Set out-of-band
-- (never committed) via scripts/apply-0034-hod.mjs, mirroring teams_webhook_url.
alter table public.teams_config add column if not exists hod_webhook_url text;

-- Independent at-least-once bookkeeping for the HOD card (separate from the
-- main channel's teams_sent_at, so one failing doesn't block the other).
alter table public.ticket_events add column if not exists hod_teams_sent_at timestamptz;

-- Never retro-send HOD cards for events that already exist at migration time.
update public.ticket_events set hod_teams_sent_at = now() where hod_teams_sent_at is null;

-- Retry cron: also re-fire ops_approved events whose HOD card is still pending
-- — but ONLY when a HOD webhook is configured, so it never loops forever when
-- the feature is unconfigured. Main-channel retry behaviour is unchanged.
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
    where created_at < now() - interval '3 minutes'
      and ( teams_sent_at is null
            or ( cfg.hod_webhook_url is not null
                 and to_status = 'ops_approved'
                 and hod_teams_sent_at is null ) )
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
