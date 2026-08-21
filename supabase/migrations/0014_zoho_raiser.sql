-- Raiser snapshot captured from Zoho Staff Profiles at raise time, so the
-- product shows "who raised it" (name, emp id, role, campus, etc.) even when the
-- raiser has no app account. raised_by_name is denormalized for quick display;
-- raised_by_details holds the full profile snapshot as JSON.
alter table public.tickets add column if not exists raised_by_name text;
alter table public.tickets add column if not exists raised_by_details jsonb;
