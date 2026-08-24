-- Capability Managers can manage the Backup Pool within their scope.
--   has_scope('capability_manager','capability', capability_id) is TRUE when the
--   CM has GLOBAL scope (any capability) OR is scoped to that exact capability.
-- This is additive to the existing admin/hod modify policy (permissive policies OR).
-- Enforced for INSERT (with check), UPDATE (using + with check — also blocks moving
-- a row to a capability they don't manage), and DELETE (using).
drop policy if exists backup_pool_cm_modify on public.backup_instructor_pool;
create policy backup_pool_cm_modify on public.backup_instructor_pool
  for all to authenticated
  using (
    public.has_scope('capability_manager', 'capability', capability_id)
    or public.has_scope('cma', 'capability', capability_id)
  )
  with check (
    public.has_scope('capability_manager', 'capability', capability_id)
    or public.has_scope('cma', 'capability', capability_id)
  );
