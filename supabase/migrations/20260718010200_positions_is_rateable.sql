-- RAT1 (audit iter 1): separate rateable skill-stations from onboarding-roadmap
-- items in public.positions so the /ratings skills matrix stops showing
-- non-skill onboarding steps and duplicate station columns.
--
-- Why the pollution exists: two independent seeders both write rows to
-- public.positions, deduped only by name:
--   * the S4 training seed (20260707020100_training_seed.sql) inserts the 21
--     FOH onboarding-roadmap stations (Orientation, Handbook & Policies,
--     Food Safety Basics, ..., Register 1/2, iPOS, Expo, ...) and links every
--     one of them to a public.roadmap_stations row; and
--   * the S3 "Seed default positions" action inserts the real setup skill
--     stations under Front Counter / Drive Thru / Dining Room / Kitchen /
--     Back of House Support.
-- The skills matrix listed BOTH sets, so it rendered non-skill onboarding
-- items as rateable stations AND duplicate "Register 1"/"Register 2" columns
-- (one from each seeder).
--
-- Fix: add positions.is_rateable, defaulting TRUE so any position a manager
-- creates through Setup Templates is rateable, and backfill FALSE for every
-- position that backs an onboarding-roadmap station. "Backs a roadmap_station"
-- is exactly the onboarding-roadmap set, so this both hides the non-skill
-- onboarding steps and drops the training-seed copy of each real station,
-- leaving the real setup skill stations rateable. The /ratings query then
-- filters on is_rateable; setups and setup templates are unaffected (they show
-- every position regardless).

alter table public.positions
  add column if not exists is_rateable boolean not null default true;

-- Backfill: onboarding-roadmap items (positions referenced by
-- roadmap_stations) are not rateable skill stations. Idempotent: re-running
-- sets the same rows to false.
update public.positions p
set is_rateable = false
where exists (
  select 1 from public.roadmap_stations rs where rs.position_id = p.id
);
