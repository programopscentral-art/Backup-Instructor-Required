-- ============================================================================
--  Budget breakdown on invoices + state on universities (analytics).
--  - invoices: split the claim into travel / accommodation / other; `amount`
--    stays the grand total (= travel + accommodation + other) for existing
--    reports and the approval chain.
--  - universities: `state` for state-wise analytics grouping (analytics only;
--    the rest of the app is unaffected).
-- ============================================================================

alter table public.invoices add column if not exists travel_amount        numeric;
alter table public.invoices add column if not exists accommodation_amount numeric;
alter table public.invoices add column if not exists other_amount         numeric;

alter table public.universities add column if not exists state text;
create index if not exists universities_state_idx on public.universities(state);
