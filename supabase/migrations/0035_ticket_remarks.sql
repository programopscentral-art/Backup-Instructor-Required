-- ============================================================================
--  Ticket remarks — a lightweight comment thread on every ticket.
--  Any role that can SEE the ticket (admin/HOD, raiser, that campus's staff, the
--  subject's CMs, the assigned backup) can read AND post remarks, and every such
--  person sees them. Remarks are immutable once posted (audit-friendly, like
--  ticket_events). Realtime so they appear live for everyone viewing the ticket.
--  Purely additive — no existing table or policy is changed.
-- ============================================================================

create table if not exists public.ticket_remarks (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id),
  author_name text,
  author_role text,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists ticket_remarks_ticket_idx on public.ticket_remarks(ticket_id, created_at);

alter table public.ticket_remarks enable row level security;

-- Visible to everyone who can see the ticket (same audience as the ticket itself).
drop policy if exists ticket_remarks_select on public.ticket_remarks;
create policy ticket_remarks_select on public.ticket_remarks for select to authenticated
  using (public.can_see_ticket(ticket_id));

-- Anyone who can see the ticket may post — as themselves, non-empty, bounded.
drop policy if exists ticket_remarks_insert on public.ticket_remarks;
create policy ticket_remarks_insert on public.ticket_remarks for insert to authenticated
  with check (
    public.can_see_ticket(ticket_id)
    and author_id = auth.uid()
    and char_length(btrim(body)) between 1 and 4000
  );
-- No update/delete policies → remarks are immutable.

-- Realtime: new remarks appear live for everyone with the ticket open.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ticket_remarks'
  ) then
    execute 'alter publication supabase_realtime add table public.ticket_remarks';
  end if;
end $$;
