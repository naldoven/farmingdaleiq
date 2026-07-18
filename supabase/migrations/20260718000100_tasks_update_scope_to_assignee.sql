-- T1 (high, broken access control): scope the completer UPDATE policy on
-- public.tasks to the caller's own tasks.
--
-- Background: tasks_update_completer (20260707050000_app_events_and_rls_backfill
-- .sql) was `for update using(has_permission('tasks.complete') or
-- has_permission('tasks.manage'))` with the SAME with-check, and NO ownership
-- predicate. Any tasks.complete holder (down to line staff) could therefore
-- UPDATE any task row — any column, any owner — via raw PostgREST: reassign
-- someone else's task, rewrite its token_value, flip its status, etc.
--
-- This REPLACES the policy so a non-manager completer may only touch tasks that
-- are theirs, while tasks.manage holders keep full update (their own broader
-- policy tasks_write_manager already grants that; this permissive policy simply
-- also allows the manager path so the two never disagree).
--
--   USING  (row eligibility): manager, OR a completer whose row is assigned to
--          them (assigned_user_id = auth.uid()) OR is still an unclaimed pool
--          task (assigned_user_id is null). The pool-task allowance is what
--          keeps claimTask working: it runs on the per-request client and
--          UPDATEs an unassigned row to set assigned_user_id = the caller.
--   WITH CHECK (resulting row): manager, OR a completer whose RESULTING row is
--          assigned to themselves. This pins the outcome: a completer can claim
--          a pool task to themselves and can update their own task, but can
--          never leave a task assigned to anyone else — closing the
--          "reassign/modify any task" hole while every app flow (claimTask,
--          completeTask) still works. Delegation/reassignment stays
--          manage-only (delegateTask requires tasks.manage).
--
-- Idempotent: drop-if-exists before create.

drop policy if exists tasks_update_completer on public.tasks;
create policy tasks_update_completer on public.tasks
  for update
  using (
    public.has_permission('tasks.manage')
    or (
      public.has_permission('tasks.complete')
      and (assigned_user_id = auth.uid() or assigned_user_id is null)
    )
  )
  with check (
    public.has_permission('tasks.manage')
    or (
      public.has_permission('tasks.complete')
      and assigned_user_id = auth.uid()
    )
  );
