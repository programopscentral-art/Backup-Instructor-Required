-- ============================================================================
--  Tickets — the backup-instructor lifecycle.
--  Raise → assign backup + mode → Ops confirm → session → (offline) invoice
--  → Ops approve → HOD approve → closed.  Every transition is audited.
-- ============================================================================

do $$ begin
  create type public.ticket_status as enum (
    'raised', 'backup_assigned', 'confirmed', 'session_done',
    'invoice_pending', 'ops_approved', 'hod_approved', 'closed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_mode as enum ('undecided', 'online', 'offline');
exception when duplicate_object then null; end $$;

create sequence if not exists public.ticket_seq;

create table if not exists public.tickets (
  id                    uuid primary key default gen_random_uuid(),
  ticket_no             text unique,
  university_id         uuid references public.universities(id) on delete set null,
  subject_id            uuid references public.subjects(id) on delete set null,
  capability_id         uuid references public.capabilities(id) on delete set null,
  absent_instructor_name text,
  reason                text,
  absent_from           date,
  absent_to             date,
  time_from             text,
  time_to               text,
  requested_mode        public.ticket_mode not null default 'undecided',
  mode                  public.ticket_mode not null default 'undecided',
  status                public.ticket_status not null default 'raised',
  assigned_backup_id    uuid references public.backup_instructor_pool(id) on delete set null,
  assigned_backup_name  text,
  raised_by             uuid references public.profiles(id) on delete set null,
  assigned_cm           uuid references public.profiles(id) on delete set null,
  confirmed_by          uuid references public.profiles(id) on delete set null,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_univ_idx on public.tickets(university_id);
create index if not exists tickets_capability_idx on public.tickets(capability_id);

create table if not exists public.ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,
  from_status public.ticket_status,
  to_status   public.ticket_status,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists ticket_events_ticket_idx on public.ticket_events(ticket_id);

-- Auto ticket number: BIT-0001, BIT-0002, …
create or replace function public.set_ticket_no()
returns trigger language plpgsql as $$
begin
  if new.ticket_no is null then
    new.ticket_no := 'BIT-' || lpad(nextval('public.ticket_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists tickets_set_no on public.tickets;
create trigger tickets_set_no before insert on public.tickets
  for each row execute function public.set_ticket_no();

-- ============================================================================
--  Scope helper + ticket visibility
-- ============================================================================
create or replace function public.has_scope(target_role public.app_role, kind public.scope_kind, target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_assignments
    where user_id = auth.uid() and role = target_role
      and (scope_type = 'global' or (scope_type = kind and scope_id = target))
  );
$$;
grant execute on function public.has_scope(public.app_role, public.scope_kind, uuid) to authenticated;

create or replace function public.can_see_ticket(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets t where t.id = tid and (
      public.is_admin_or_hod()
      or t.raised_by = auth.uid()
      or public.has_scope('university_staff', 'university', t.university_id)
      or public.has_scope('capability_manager', 'capability', t.capability_id)
      or public.has_scope('cma', 'capability', t.capability_id)
    )
  );
$$;
grant execute on function public.can_see_ticket(uuid) to authenticated;

-- ============================================================================
--  RLS
-- ============================================================================
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated using (
  public.is_admin_or_hod()
  or raised_by = auth.uid()
  or public.has_scope('university_staff', 'university', university_id)
  or public.has_scope('capability_manager', 'capability', capability_id)
  or public.has_scope('cma', 'capability', capability_id)
);

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated with check (
  public.is_admin_or_hod()
  or (raised_by = auth.uid() and public.has_role('university_staff'))
);

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated using (
  public.is_admin_or_hod()
  or public.has_scope('capability_manager', 'capability', capability_id)
  or public.has_scope('cma', 'capability', capability_id)
) with check (
  public.is_admin_or_hod()
  or public.has_scope('capability_manager', 'capability', capability_id)
  or public.has_scope('cma', 'capability', capability_id)
);

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated using (public.is_admin_or_hod());

drop policy if exists ticket_events_select on public.ticket_events;
create policy ticket_events_select on public.ticket_events for select to authenticated using (
  public.is_admin_or_hod() or public.can_see_ticket(ticket_id)
);

drop policy if exists ticket_events_insert on public.ticket_events;
create policy ticket_events_insert on public.ticket_events for insert to authenticated with check (
  public.can_see_ticket(ticket_id)
);

-- Realtime
do $$
declare t text;
begin
  foreach t in array array['tickets', 'ticket_events'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
