-- ============================================================================
--  Audit log — admin / access history (who did what, when).
--  Ticket activity is already captured in ticket_events; this covers access
--  grants, revokes and other admin actions for the "Logs" view.
-- ============================================================================
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_name   text,
  action       text not null,          -- grant_role / revoke_role / delete_grant / ...
  target_email text,
  role         text,
  scope_type   text,
  scope_id     uuid,
  detail       text,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_admin_or_hod());

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (public.is_admin_or_hod());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.audit_log';
  exception when duplicate_object then null;
  end;
end $$;
