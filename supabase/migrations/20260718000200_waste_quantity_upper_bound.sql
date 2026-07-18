-- W2 (audit iter 1, HIGH money): waste_entries.quantity had a positivity CHECK
-- (20260707100004_waste_check_constraints.sql) but NO upper bound. The zod
-- schema, the DB column (unconstrained numeric), and the <input type="number">
-- all accepted arbitrarily large values, so a typo like 1e21 was persisted and
-- rendered as "$5.84e+21" in the cost rollups. The app layer now bounds it at
-- WASTE_QUANTITY_MAX (10,000) in three places; this CHECK is the DB backstop for
-- a direct PostgREST insert that bypasses the app, mirroring the positivity
-- CHECK's pattern (drop-if-exists, then add).
--
-- 10,000 matches app/(app)/waste/constants.ts WASTE_QUANTITY_MAX. A real
-- one-shot waste entry (a pan, tray, or case) is a few units to low hundreds, so
-- this rejects only typo-scale values.
--
-- Idempotent: drop-constraint-if-exists before add.

alter table public.waste_entries
  drop constraint if exists waste_entries_quantity_upper_bound;
alter table public.waste_entries
  add constraint waste_entries_quantity_upper_bound check (quantity <= 10000);
