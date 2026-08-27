-- ============================================================================
--  Keep the capability "lead" (capabilities.manager_*) in sync with the
--  authoritative capability_managers list. Single-value displays (ticket detail,
--  Teams card, analytics CM workload) read the lead; this trigger recomputes it
--  from the first active CM whenever the list changes, so it never drifts.
-- ============================================================================

create or replace function public.sync_capability_lead()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  cid uuid;
  lead record;
begin
  cid := coalesce(new.capability_id, old.capability_id);
  select name, email, user_id
    into lead
  from public.capability_managers
  where capability_id = cid and status = 'active'
  order by created_at asc
  limit 1;

  -- lead is null when no active CMs remain → clears the lead fields.
  update public.capabilities
     set manager_name    = lead.name,
         manager_email   = lead.email,
         manager_user_id = lead.user_id
   where id = cid;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_capability_lead on public.capability_managers;
create trigger trg_sync_capability_lead
  after insert or update or delete on public.capability_managers
  for each row execute function public.sync_capability_lead();

-- Backfill: set the lead from the current list for every capability that has CMs
-- (leave capabilities with no CM rows untouched — they keep any existing lead).
update public.capabilities c
   set manager_name    = lead.name,
       manager_email   = lead.email,
       manager_user_id = lead.user_id
from (
  select distinct on (capability_id) capability_id, name, email, user_id
  from public.capability_managers
  where status = 'active'
  order by capability_id, created_at asc
) lead
where c.id = lead.capability_id;
