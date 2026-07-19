-- ACC2: prevent duplicate pending disciplinary actions under concurrency.
--
-- issueInfraction (app/(app)/accountability/actions.ts) decides which ladder
-- rungs a recipient just crossed with a read-then-insert
-- (findNewlyTriggeredThresholds) that takes no lock. Two infractions issued
-- to the same person at nearly the same time could each read the SAME rung as
-- "newly crossed" and each insert a pending disciplinary_actions row for it --
-- a duplicate write-up for one real crossing.
--
-- This partial unique index makes at most one pending action exist per
-- (user_id, type_id): the loser of the race collides with 23505, which the
-- action now swallows as a no-op (the rung is already open). It is partial on
-- status = 'pending' so the history of resolved rows (acknowledged / expired)
-- is unconstrained -- a legitimate later re-crossing, after the prior action
-- was closed out, can open a fresh pending row.
--
-- Idempotent: drop-index-if-exists before create. Should live data already
-- hold duplicate pending rows for a (user_id, type_id), creation will fail --
-- de-duplicate to a single pending row per pair first, then re-run.

drop index if exists public.disciplinary_actions_pending_uq;
create unique index disciplinary_actions_pending_uq
  on public.disciplinary_actions (user_id, type_id)
  where status = 'pending';
