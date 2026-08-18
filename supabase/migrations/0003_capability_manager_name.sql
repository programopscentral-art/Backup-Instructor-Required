-- Store the capability manager's display name until their user account is linked.
alter table public.capabilities add column if not exists manager_name text;
