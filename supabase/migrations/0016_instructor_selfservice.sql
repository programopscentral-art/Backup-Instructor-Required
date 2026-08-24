-- ============================================================================
--  Backup-instructor self-service
--  - email on the pool → links a Google login to a backup entry
--  - assigned backup can SEE their ticket (→ can upload the invoice, via existing
--    can_see_ticket-based invoice/storage policies)
--  - first login of a pooled email auto-grants the 'instructor' role (activates them)
-- ============================================================================

alter table public.backup_instructor_pool add column if not exists email text;
create index if not exists backup_pool_email_idx on public.backup_instructor_pool(lower(email));

-- Assigned backup (matched by email) can see their own ticket.
create or replace function public.can_see_ticket(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets t where t.id = tid and (
      public.is_admin_or_hod()
      or t.raised_by = auth.uid()
      or public.has_scope('university_staff', 'university', t.university_id)
      or public.has_scope('capability_manager', 'capability', t.capability_id)
      or public.has_scope('cma', 'capability', t.capability_id)
      or exists (
        select 1
        from public.backup_instructor_pool bp
        join public.profiles p on lower(p.email) = lower(bp.email)
        where bp.id = t.assigned_backup_id and p.id = auth.uid()
      )
    )
  );
$$;

-- On first login, a pooled email is auto-granted the instructor role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_has_role boolean := false;
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'pending'
  )
  on conflict (id) do nothing;

  -- pre-authorized grants for this email
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  select new.id, g.role, g.scope_type, g.scope_id, g.granted_by
  from public.access_grants g
  where lower(g.email) = lower(new.email) and g.applied_at is null
  on conflict (user_id, role, scope_type, scope_id) do nothing;

  update public.access_grants
     set applied_at = now()
   where lower(email) = lower(new.email) and applied_at is null;

  -- backup instructors (in the pool by email) become 'instructor' automatically
  if exists (select 1 from public.backup_instructor_pool where lower(email) = lower(new.email)) then
    insert into public.role_assignments (user_id, role, scope_type, scope_id)
    values (new.id, 'instructor', 'global', null)
    on conflict (user_id, role, scope_type, scope_id) do nothing;
  end if;

  select exists(select 1 from public.role_assignments where user_id = new.id) into v_has_role;
  if v_has_role then
    update public.profiles set status = 'active', updated_at = now() where id = new.id;
  end if;

  return new;
end;
$$;
