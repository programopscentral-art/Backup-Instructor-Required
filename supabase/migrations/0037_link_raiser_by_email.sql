-- ============================================================================
--  Link Zoho tickets to their raiser by email.
--  A Zoho ticket stores raised_by_email, but raised_by (the app account) is only
--  set if that person had ALREADY logged in when the ticket arrived. Anyone who
--  raised tickets in Zoho before their first login could not open them
--  (can_see_ticket checks raised_by) and didn't see them in My Assignments.
--
--  1. Backfill: link every existing unlinked ticket whose raised_by_email matches
--     a profile.
--  2. Going forward: when a profile is created (first login) or its email changes,
--     link that person's unlinked tickets.
--  Purely additive — can_see_ticket and existing policies are unchanged.
-- ============================================================================

-- 1. Backfill
update public.tickets t
set raised_by = p.id
from public.profiles p
where t.raised_by is null
  and t.raised_by_email is not null
  and lower(p.email) = lower(t.raised_by_email);

-- 2. Link on first login / email change
create or replace function public.link_tickets_to_raiser()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.email is not null then
    update public.tickets
    set raised_by = new.id
    where raised_by is null
      and raised_by_email is not null
      and lower(raised_by_email) = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_link_raised_tickets on public.profiles;
create trigger profiles_link_raised_tickets
  after insert or update of email on public.profiles
  for each row execute function public.link_tickets_to_raiser();
