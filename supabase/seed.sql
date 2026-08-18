-- ============================================================================
--  Bootstrap seed — run once after 0001_init.sql
--  Pre-authorizes the Program Ops account as the first Admin (global scope).
--  On this email's first Google login the grant is applied automatically and
--  the profile is activated as Admin. From there, Admin grants everyone else.
-- ============================================================================

insert into public.access_grants (email, role, scope_type, granted_by)
select 'programopscentral@nxtwave.in', 'admin', 'global', null
where not exists (
  select 1 from public.access_grants
  where lower(email) = lower('programopscentral@nxtwave.in') and role = 'admin'
);
