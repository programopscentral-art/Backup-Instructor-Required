-- ============================================================================
--  Raise-ticket enhancements + Subject Sessions.
--  * ticket_reasons  : dynamic reason categories (Absent / Assigned … / +Add)
--  * tickets         : reason_category + absent_instructor_id
--  * subject_sessions: optional teaching-session log per university
--  * list_capability_managers(): safe CM directory for the "notify CMs" feature
-- ============================================================================

-- ---- Dynamic reason categories --------------------------------------------
create table if not exists public.ticket_reasons (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  created_at timestamptz not null default now()
);
insert into public.ticket_reasons (label)
select v from (values ('Absent'), ('Assigned With Other Work')) as t(v)
where not exists (select 1 from public.ticket_reasons r where r.label = t.v);

alter table public.ticket_reasons enable row level security;
drop policy if exists ticket_reasons_select on public.ticket_reasons;
create policy ticket_reasons_select on public.ticket_reasons for select to authenticated using (true);
drop policy if exists ticket_reasons_insert on public.ticket_reasons;
create policy ticket_reasons_insert on public.ticket_reasons for insert to authenticated with check (true);

-- ---- Ticket columns --------------------------------------------------------
alter table public.tickets add column if not exists reason_category text;
alter table public.tickets add column if not exists absent_instructor_id uuid references public.instructors(id) on delete set null;

-- ---- Subject sessions (optional teaching log) ------------------------------
create table if not exists public.subject_sessions (
  id              uuid primary key default gen_random_uuid(),
  university_id   uuid references public.universities(id) on delete set null,
  subject_id      uuid references public.subjects(id) on delete set null,
  title           text,
  instructor_name text,
  schedule        text,
  notes           text,
  status          text not null default 'active',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists subject_sessions_univ_idx on public.subject_sessions(university_id);

alter table public.subject_sessions enable row level security;
drop policy if exists subject_sessions_select on public.subject_sessions;
create policy subject_sessions_select on public.subject_sessions for select to authenticated
  using (public.is_admin_or_hod() or public.can_see_university(university_id));
drop policy if exists subject_sessions_modify on public.subject_sessions;
create policy subject_sessions_modify on public.subject_sessions for all to authenticated
  using (public.is_admin_or_hod() or (public.has_role('university_staff') and public.can_see_university(university_id)))
  with check (public.is_admin_or_hod() or (public.has_role('university_staff') and public.can_see_university(university_id)));

-- ---- Activity log covers titles too + logs subject_sessions ----------------
create or replace function public.log_directory_activity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rec jsonb;
  v_action text;
  v_actor uuid := auth.uid();
  v_actor_name text;
begin
  if (TG_OP = 'DELETE') then rec := to_jsonb(OLD); v_action := 'delete';
  elsif (TG_OP = 'UPDATE') then rec := to_jsonb(NEW); v_action := 'update';
  else rec := to_jsonb(NEW); v_action := 'create';
  end if;
  select full_name into v_actor_name from public.profiles where id = v_actor;
  insert into public.activity_log (actor_id, actor_name, action, entity, entity_id, entity_name, university_id, detail)
  values (
    v_actor, coalesce(v_actor_name, 'System'), v_action, TG_TABLE_NAME,
    nullif(rec->>'id', '')::uuid,
    coalesce(rec->>'full_name', rec->>'instructor_name', rec->>'title', rec->>'name'),
    nullif(rec->>'university_id', '')::uuid, null
  );
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists subject_sessions_activity on public.subject_sessions;
create trigger subject_sessions_activity
  after insert or update or delete on public.subject_sessions
  for each row execute function public.log_directory_activity();

-- ---- Safe capability-manager directory (for "notify CMs") ------------------
create or replace function public.list_capability_managers()
returns table (user_id uuid, name text, email text, capability text)
language sql stable security definer set search_path = public
as $$
  select distinct p.id, coalesce(p.full_name, p.email), p.email, c.name
  from public.role_assignments ra
  join public.profiles p on p.id = ra.user_id
  left join public.capabilities c on c.id = ra.scope_id
  where ra.role in ('capability_manager', 'cma');
$$;
grant execute on function public.list_capability_managers() to authenticated;

-- ---- Realtime --------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ticket_reasons', 'subject_sessions'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
