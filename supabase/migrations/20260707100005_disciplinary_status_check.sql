-- FIQ parity R101 (Accountability, LOW): disciplinary_actions.status had no CHECK
-- constraint, so a stray value would silently drop out of the nightly cron sweep
-- (app/api/cron/accountability/route.ts) and the badge logic. The code writes only
-- 'pending', 'acknowledged', and 'expired' (verified across the accountability
-- actions and cron). Pin the domain at the DB.
--
-- Live data verified clean before applying (0 rows outside the allowed set).
-- Idempotent: drop-constraint-if-exists before add.

alter table public.disciplinary_actions
  drop constraint if exists disciplinary_actions_status_check;
alter table public.disciplinary_actions
  add constraint disciplinary_actions_status_check
  check (status in ('pending', 'acknowledged', 'expired'));
