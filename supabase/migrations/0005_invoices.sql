-- ============================================================================
--  Invoices — offline claims. Charge slips (Storage) + mandatory NxtClaim link,
--  24-hour SLA, then Ops → HOD approval (drives the ticket's approval steps).
-- ============================================================================

do $$ begin
  create type public.invoice_status as enum ('submitted', 'ops_approved', 'hod_approved', 'returned');
exception when duplicate_object then null; end $$;

-- When a ticket goes offline+session_done, the 24h clock is stamped here.
alter table public.tickets add column if not exists invoice_due_at timestamptz;

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null unique references public.tickets(id) on delete cascade,
  session_date     date,
  description      text,
  amount           numeric(12, 2),
  nxtclaim_link    text not null,
  status           public.invoice_status not null default 'submitted',
  late             boolean not null default false,
  submitted_by     uuid references public.profiles(id) on delete set null,
  submitted_by_name text,
  submitted_at     timestamptz not null default now(),
  ops_approved_by  uuid references public.profiles(id) on delete set null,
  ops_approved_at  timestamptz,
  hod_approved_by  uuid references public.profiles(id) on delete set null,
  hod_approved_at  timestamptz,
  return_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.invoice_files (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  path        text not null,
  name        text,
  created_at  timestamptz not null default now()
);
create index if not exists invoice_files_invoice_idx on public.invoice_files(invoice_id);

-- ============================================================================
--  RLS
-- ============================================================================
alter table public.invoices enable row level security;
alter table public.invoice_files enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
  using (public.is_admin_or_hod() or public.can_see_ticket(ticket_id));

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check (public.can_see_ticket(ticket_id));

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated
  using (public.is_admin_or_hod() or submitted_by = auth.uid())
  with check (public.is_admin_or_hod() or submitted_by = auth.uid());

drop policy if exists invoice_files_select on public.invoice_files;
create policy invoice_files_select on public.invoice_files for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and (public.is_admin_or_hod() or public.can_see_ticket(i.ticket_id))
  ));

drop policy if exists invoice_files_insert on public.invoice_files;
create policy invoice_files_insert on public.invoice_files for insert to authenticated
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.can_see_ticket(i.ticket_id)
  ));

-- ============================================================================
--  Storage bucket for charge slips (private)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

drop policy if exists invoices_obj_insert on storage.objects;
create policy invoices_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices');

drop policy if exists invoices_obj_select on storage.objects;
create policy invoices_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'invoices');

drop policy if exists invoices_obj_delete on storage.objects;
create policy invoices_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and (owner = auth.uid() or public.is_admin_or_hod()));

-- Realtime
do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_files'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
