-- ============================================================================
--  Zoho Creator integration (read-only): tickets can originate in Zoho.
--  source = 'zoho', zoho_record_id for idempotency, raised_by_email for the
--  Zoho submitter (who may or may not have an app account).
-- ============================================================================
alter table public.tickets add column if not exists source text not null default 'app';
alter table public.tickets add column if not exists zoho_record_id text;
alter table public.tickets add column if not exists raised_by_email text;

-- Idempotency: the same Zoho record never creates two tickets.
create unique index if not exists tickets_zoho_record_id_key
  on public.tickets(zoho_record_id) where zoho_record_id is not null;
