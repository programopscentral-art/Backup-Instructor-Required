-- ============================================================================
--  University staff can manage THEIR campus's staff + instructors (full CRUD),
--  and every change is auto-logged via triggers (can't be bypassed) into the
--  university activity log — visible to that university's staff and to admins.
-- ============================================================================

-- ---- Activity log (directory CRUD history) --------------------------------
create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text,
  action        text not null,        -- create / update / delete
  entity        text not null,        -- university_staff / instructors
  entity_id     uuid,
  entity_name   text,
  university_id uuid references public.universities(id) on delete set null,
  detail        text,
  created_at    timestamptz not null default now()
);
create index if not exists activity_log_univ_idx on public.activity_log(university_id);
create index if not exists activity_log_created_idx on public.activity_log(created_at desc);

alter table public.activity_log enable row level security;

-- Admin/HOD see all; a university's staff see only their campus's activity.
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_admin_or_hod() or public.can_see_university(university_id));
-- No INSERT policy on purpose: only the SECURITY DEFINER trigger writes here.

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.activity_log';
  exception when duplicate_object then null; end;
end $$;

-- ---- Trigger: auto-log any directory change --------------------------------
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
  if (TG_OP = 'DELETE') then
    rec := to_jsonb(OLD); v_action := 'delete';
  elsif (TG_OP = 'UPDATE') then
    rec := to_jsonb(NEW); v_action := 'update';
  else
    rec := to_jsonb(NEW); v_action := 'create';
  end if;

  select full_name into v_actor_name from public.profiles where id = v_actor;

  insert into public.activity_log (actor_id, actor_name, action, entity, entity_id, entity_name, university_id, detail)
  values (
    v_actor,
    coalesce(v_actor_name, 'System'),
    v_action,
    TG_TABLE_NAME,
    nullif(rec->>'id', '')::uuid,
    coalesce(rec->>'full_name', rec->>'instructor_name', rec->>'name'),
    nullif(rec->>'university_id', '')::uuid,
    null
  );
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists university_staff_activity on public.university_staff;
create trigger university_staff_activity
  after insert or update or delete on public.university_staff
  for each row execute function public.log_directory_activity();

drop trigger if exists instructors_activity on public.instructors;
create trigger instructors_activity
  after insert or update or delete on public.instructors
  for each row execute function public.log_directory_activity();

-- ---- Allow staff to write their own campus's staff + instructors ----------
drop policy if exists university_staff_modify on public.university_staff;
create policy university_staff_modify on public.university_staff for all to authenticated
  using (public.is_admin_or_hod() or (public.has_role('university_staff') and public.can_see_university(university_id)))
  with check (public.is_admin_or_hod() or (public.has_role('university_staff') and public.can_see_university(university_id)));

drop policy if exists instructors_modify on public.instructors;
create policy instructors_modify on public.instructors for all to authenticated
  using (public.is_admin_or_hod() or (public.has_role('university_staff') and public.can_see_university(university_id)))
  with check (public.is_admin_or_hod() or (public.has_role('university_staff') and public.can_see_university(university_id)));
