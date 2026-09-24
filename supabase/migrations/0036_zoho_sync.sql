-- ============================================================================
--  Zoho safety-net sync.
--  Zoho's intake workflow POSTs each new ticket to us ONCE with no retry, so a
--  single failed call silently loses the ticket. Every 15 minutes this job
--  pings /api/zoho/sync, which reads recent "Backup Instructor Required" records
--  from the Zoho API and ingests any missing ones (idempotent by record id).
--
--  Ships DISABLED. Enable after the /api/zoho/sync route is deployed:
--    update public.zoho_sync_config set enabled = true where id = true;
--  Purely additive — no existing table, policy or job is changed.
-- ============================================================================

create extension if not exists pg_net;

-- Single-row config. RLS on with NO policies → unreadable to users; only the
-- SECURITY DEFINER function below and the service role touch it. The secret is
-- generated here, so no human ever handles it.
create table if not exists public.zoho_sync_config (
  id          boolean primary key default true,
  enabled     boolean not null default false,
  sync_url    text,
  sync_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  last_run_at timestamptz,
  constraint zoho_sync_config_one_row check (id = true)
);
alter table public.zoho_sync_config enable row level security;
insert into public.zoho_sync_config (id, sync_url)
values (true, 'https://backup-instructor-required.vercel.app/api/zoho/sync')
on conflict (id) do nothing;

-- Fire one async POST to the sync route (no-op while disabled).
create or replace function public.run_zoho_sync()
returns void
language plpgsql security definer set search_path = public
as $$
declare cfg public.zoho_sync_config;
begin
  select * into cfg from public.zoho_sync_config where id = true;
  if cfg.enabled is not true or cfg.sync_url is null then
    return;
  end if;
  perform net.http_post(
    url                  := cfg.sync_url,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', cfg.sync_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'zoho-sync') then
    perform cron.schedule('zoho-sync', '*/15 * * * *', 'select public.run_zoho_sync()');
  end if;
end $$;
