-- Breaks release readiness (docs/BREAKS-RELEASE-READINESS.md).
--
-- 1. setup_assignments.scheduled_end
--    The live Farmingdale break rule is "scheduled 6 hours earns one 30-minute
--    break". The engine previously measured a shift as arrival -> day-part end,
--    and every seeded day-part is shorter than 5 hours, so no adult ever
--    qualified for a break. Leaders now record when each person is scheduled
--    to leave; the engine measures arrival -> scheduled_end and falls back to
--    the day-part end only when no scheduled end is recorded. Nullable, so
--    existing rows and the setup e2e fixture are unaffected.
--
-- 2. breaks (setup_id, user_id, kind) unique index
--    generateBreaksForSetup() reads existing rows then inserts the missing
--    ones. Two leaders pressing "Generate / refresh break plan" at the same
--    moment could both pass the read and insert the same entitlement twice.
--    The index makes the second insert a no-op (the action upserts with
--    ignoreDuplicates against it). Plain, non-partial index so it can act as
--    the ON CONFLICT arbiter; user_id is never null on an inserted break.
--
-- Verified against the live DB on 2026-10-25 before writing: `breaks` has zero
-- rows, so nothing blocks index creation.

alter table public.setup_assignments
  add column if not exists scheduled_end timestamptz;

comment on column public.setup_assignments.scheduled_end is
  'When this person is scheduled to leave. Drives break entitlement (arrival -> scheduled_end); null falls back to the day-part end.';

drop index if exists public.breaks_setup_user_kind_uq;
create unique index breaks_setup_user_kind_uq
  on public.breaks (setup_id, user_id, kind);
