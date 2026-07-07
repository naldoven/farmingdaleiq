-- Idempotency backstops: unique indexes that hard-fail duplicate rows the
-- read-then-insert code paths could otherwise create under concurrency.
-- Bundles the DB half of several findings into one migration batch:
--
--   FIQ-03 (high): token_transactions ((ref->>'event_id')) — a duplicate token
--     award for the same source app_event fails at the DB, backstopping the
--     cron double-mint and every event-keyed award path (09/10/11/14).
--   FIQ-09 (med): checklist_runs (schedule_id, run_date).
--   FIQ-10 (med): checklist_answers (run_id, question_id).
--   FIQ-11 (med): setups (date, day_part_id) — split into a not-null pair and
--     a null-day_part pair so the null case is covered too.
--   FIQ-14 (low): tasks (template_id, date).
--   FIQ-15 (low): setup_assignments (setup_id, position_id).
--   FIQ-16 (low): follow_ups (source_answer_id).
--   FIQ-17 (low): layout_tiles (layout_id, position_id).
--
-- Verified against the live DB before applying: every one of these tables is
-- empty, so no existing duplicates block index creation.
--
-- Idempotent: every index is dropped-if-exists before creation. Partial
-- WHERE ... is not null clauses so legitimately-null keys (an adhoc task with
-- no template, an unassigned setup slot, a persistent-schedule run) don't
-- collide with each other.

-- FIQ-03 -----------------------------------------------------------------
-- Only rows whose ref carries an event_id are constrained; redeem/gift/adjust
-- rows (ref has reward_id / to_user_id / reason instead) are unaffected.
drop index if exists public.token_transactions_event_id_uq;
create unique index token_transactions_event_id_uq
  on public.token_transactions ((ref->>'event_id'))
  where ref ? 'event_id';

-- FIQ-09 -----------------------------------------------------------------
-- Plain (non-partial) unique index: NULLs are distinct by default, so a
-- manual run with a null schedule_id never collides, AND the code paths can
-- use it as an ON CONFLICT (schedule_id, run_date) arbiter for upsert
-- (Postgres cannot infer a partial index as an ON CONFLICT arbiter).
drop index if exists public.checklist_runs_schedule_date_uq;
create unique index checklist_runs_schedule_date_uq
  on public.checklist_runs (schedule_id, run_date);

-- FIQ-10 -----------------------------------------------------------------
drop index if exists public.checklist_answers_run_question_uq;
create unique index checklist_answers_run_question_uq
  on public.checklist_answers (run_id, question_id);

-- FIQ-11 -----------------------------------------------------------------
drop index if exists public.setups_date_daypart_uq;
create unique index setups_date_daypart_uq
  on public.setups (date, day_part_id)
  where day_part_id is not null;

drop index if exists public.setups_date_null_daypart_uq;
create unique index setups_date_null_daypart_uq
  on public.setups (date)
  where day_part_id is null;

-- FIQ-14 -----------------------------------------------------------------
-- Plain unique index (adhoc tasks have a null template_id and stay distinct);
-- usable as an ON CONFLICT (template_id, date) upsert arbiter.
drop index if exists public.tasks_template_date_uq;
create unique index tasks_template_date_uq
  on public.tasks (template_id, date);

-- FIQ-15 -----------------------------------------------------------------
-- Plain unique index so assignPosition/createSetup can upsert on
-- (setup_id, position_id); position_id is always set on the assign paths.
drop index if exists public.setup_assignments_setup_position_uq;
create unique index setup_assignments_setup_position_uq
  on public.setup_assignments (setup_id, position_id);

-- FIQ-16 -----------------------------------------------------------------
drop index if exists public.follow_ups_source_answer_uq;
create unique index follow_ups_source_answer_uq
  on public.follow_ups (source_answer_id)
  where source_answer_id is not null;

-- FIQ-17 -----------------------------------------------------------------
-- Plain unique index so upsertTile can merge on (layout_id, position_id); a
-- position-less area tile has a null position_id and stays distinct.
drop index if exists public.layout_tiles_layout_position_uq;
create unique index layout_tiles_layout_position_uq
  on public.layout_tiles (layout_id, position_id);
