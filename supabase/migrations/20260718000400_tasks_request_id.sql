-- T2 (audit iter 1, HIGH idempotency): createTask had no double-submit guard
-- (unlike claimTask/completeTask, which use conditional UPDATEs). A retry or
-- double-tap created duplicate tasks. Add a nullable request_id column plus a
-- unique partial index so a second insert carrying the same client-generated id
-- fails with 23505; app/(app)/tasks/actions.ts createTask catches that and
-- returns the first task instead of a duplicate.
--
-- Nullable + partial index: existing rows and any insert that omits a request_id
-- stay null and never collide (NULLs are distinct, and the WHERE clause excludes
-- them entirely), so the change is backward compatible with every current caller
-- (materializer, system tasks, reward-fulfillment wiring).
--
-- Idempotent: add-column-if-not-exists, drop-index-if-exists before create.

alter table public.tasks
  add column if not exists request_id uuid;

drop index if exists public.tasks_request_id_uq;
create unique index tasks_request_id_uq
  on public.tasks (request_id)
  where request_id is not null;
