-- FIQ parity R43 (Setups & Breaks, MED): RLS on setups/setup_assignments was
-- broader than the app's permission split. The old policies (20260707050000_
-- app_events_and_rls_backfill.sql) granted ALL on both tables to
-- setups.manage OR setups.post, but the server actions gate the write paths as:
--
--   createSetup      -> setups.manage  (INSERT setups + upsert assignments)
--   assignPosition   -> setups.manage  (upsert setup_assignments)
--   removeAssignment -> setups.manage  (DELETE setup_assignments)
--   postSetup        -> setups.post    (UPDATE setups.posted_at/posted_by only;
--                                        reads assignments, never writes them)
--
-- So a setups.post-only Team Leader could INSERT/DELETE setups and assignments
-- directly via PostgREST, bypassing the manage gate. Tighten to match:
--   * setup_assignments: all writes (INSERT/UPDATE/DELETE) require setups.manage.
--   * setups: INSERT/DELETE require setups.manage; UPDATE stays manage-or-post so
--     the post action (which only updates the setup row) still works.
-- SELECT stays open to any authenticated member on both tables (unchanged).
--
-- Replaces the single FOR ALL policies with per-command policies. Permissive
-- policies OR with the P0 default_deny (using false), so false OR cond = cond.
-- Idempotent: drop-if-exists before each create.

-- ---------------------------------------------------------------------------
-- setups: INSERT/DELETE -> manage; UPDATE -> manage or post.
-- ---------------------------------------------------------------------------
drop policy if exists setups_write on public.setups;

drop policy if exists setups_insert_manager on public.setups;
create policy setups_insert_manager on public.setups
  for insert
  with check (public.has_permission('setups.manage'));

drop policy if exists setups_update_poster on public.setups;
create policy setups_update_poster on public.setups
  for update
  using (public.has_permission('setups.manage') or public.has_permission('setups.post'))
  with check (public.has_permission('setups.manage') or public.has_permission('setups.post'));

drop policy if exists setups_delete_manager on public.setups;
create policy setups_delete_manager on public.setups
  for delete
  using (public.has_permission('setups.manage'));

-- ---------------------------------------------------------------------------
-- setup_assignments: all writes -> manage only.
-- ---------------------------------------------------------------------------
drop policy if exists setup_assignments_write on public.setup_assignments;

drop policy if exists setup_assignments_insert_manager on public.setup_assignments;
create policy setup_assignments_insert_manager on public.setup_assignments
  for insert
  with check (public.has_permission('setups.manage'));

drop policy if exists setup_assignments_update_manager on public.setup_assignments;
create policy setup_assignments_update_manager on public.setup_assignments
  for update
  using (public.has_permission('setups.manage'))
  with check (public.has_permission('setups.manage'));

drop policy if exists setup_assignments_delete_manager on public.setup_assignments;
create policy setup_assignments_delete_manager on public.setup_assignments
  for delete
  using (public.has_permission('setups.manage'));
