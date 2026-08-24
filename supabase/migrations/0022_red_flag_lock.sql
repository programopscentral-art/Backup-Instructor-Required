-- ============================================================================
--  3-red-flag invoice-upload lock.
--  Each time a backup instructor's ticket misses the 24h invoice window it's a
--  strike (red_flags++). At 3 strikes upload_blocked flips true (derived), and
--  submitInvoice refuses their upload until an Admin/CM resets red_flags to 0.
-- ============================================================================

alter table public.backup_instructor_pool add column if not exists red_flags integer not null default 0;
alter table public.backup_instructor_pool add column if not exists upload_blocked boolean not null default false;

-- upload_blocked is always derived from the strike count.
create or replace function public.derive_upload_block()
returns trigger language plpgsql as $$
begin
  new.upload_blocked := (coalesce(new.red_flags, 0) >= 3);
  return new;
end;
$$;
drop trigger if exists trg_derive_upload_block on public.backup_instructor_pool;
create trigger trg_derive_upload_block
  before insert or update on public.backup_instructor_pool
  for each row execute function public.derive_upload_block();

-- Overdue cron now also tallies a strike against the assigned backup instructor.
create or replace function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  with upd as (
    update public.tickets t
       set red_flag = true, red_flag_at = now()
     where t.status = 'invoice_pending'
       and t.red_flag = false
       and t.invoice_due_at is not null
       and t.invoice_due_at < now()
       and not exists (select 1 from public.invoices i where i.ticket_id = t.id)
    returning t.id, t.assigned_backup_id
  ),
  bump as (
    select assigned_backup_id, count(*)::int cnt
    from upd where assigned_backup_id is not null group by assigned_backup_id
  ),
  applied as (
    update public.backup_instructor_pool bp
       set red_flags = bp.red_flags + b.cnt
      from bump b where bp.id = b.assigned_backup_id
    returning 1
  )
  select count(*) into n from upd;
  return n;
end;
$$;
