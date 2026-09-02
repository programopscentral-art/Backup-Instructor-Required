-- ============================================================================
--  In-app notifications for people not-yet-signed-in.
--  Problem: a CM/backup added by email who hasn't logged in has no `profiles`
--  row, so notify() writes the notification with recipient_user_id = NULL. The
--  bell only shows recipient_user_id = auth.uid(), so that row is invisible to
--  everyone — even to the person after they eventually sign in (the row stays
--  NULL). Email + Teams still reached them (they key off the address); only the
--  in-app bell missed it.
--  Fix: (1) claim NULL-user notifications by email the moment the account exists
--  (signup + re-check-access), (2) let the SELECT policy also match by email, and
--  (3) backfill any existing orphans onto matching accounts.
-- ============================================================================

-- 1) SELECT policy: also match notifications addressed to the caller's email.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (
    recipient_user_id = auth.uid()
    or (
      recipient_email is not null
      and lower(recipient_email) = lower((select email from public.profiles where id = auth.uid()))
    )
    or public.is_admin_or_hod()
  );

-- 2a) Claim orphaned notifications by email on first sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'pending'
  )
  on conflict (id) do nothing;

  perform public.provision_user_access(new.id, new.email);

  -- Attach any notifications that were addressed to this email before the account existed.
  update public.notifications
     set recipient_user_id = new.id
   where recipient_user_id is null
     and recipient_email is not null
     and lower(recipient_email) = lower(new.email);

  return new;
end;
$$;

-- 2b) ...and when an existing user re-checks their access.
create or replace function public.sync_my_access()
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then return false; end if;
  perform public.provision_user_access(auth.uid(), v_email);
  update public.notifications
     set recipient_user_id = auth.uid()
   where recipient_user_id is null
     and recipient_email is not null
     and lower(recipient_email) = lower(v_email);
  return exists (select 1 from public.role_assignments where user_id = auth.uid());
end;
$$;
grant execute on function public.sync_my_access() to authenticated;

-- 3) Backfill existing orphaned notifications onto accounts that already exist.
update public.notifications n
   set recipient_user_id = p.id
  from public.profiles p
 where n.recipient_user_id is null
   and n.recipient_email is not null
   and lower(n.recipient_email) = lower(p.email);
