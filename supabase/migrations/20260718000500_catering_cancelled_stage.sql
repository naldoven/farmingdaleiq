-- CAT1: add a terminal `cancelled` stage to catering orders.
--
-- Before this there was no way to remove an erroneous/duplicate/walked-away
-- order from the pipeline: forcing it to `closed` permanently counted it in
-- revenue and queued a re-book follow-up. The app now moves such orders to a
-- `cancelled` stage (cancelOrder action) that every revenue/analytics/history
-- rollup excludes (see app/(app)/catering/logic.ts NON_REVENUE_STAGES) and
-- that never queues a follow-up.
--
-- catering_orders.stage's CHECK constraint (supabase/migrations/
-- 20260707001500_catering.sql) enumerates the allowed values, so it must learn
-- about 'cancelled' or the update would fail with a check violation. The
-- column constraint Postgres created is catering_orders_stage_check.
--
-- Idempotent: drop-constraint-if-exists before re-adding the widened domain.
-- No data backfill needed (existing rows all sit on the prior six stages).

alter table public.catering_orders
  drop constraint if exists catering_orders_stage_check;

alter table public.catering_orders
  add constraint catering_orders_stage_check
  check (stage in ('new', 'confirm', 'setup', 'out', 'followup', 'closed', 'cancelled'));
