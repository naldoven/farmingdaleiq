-- SEED-DEFAULT: draft checklist_templates migrated from the live Farmingdale
-- KitchenIQ template NAMES (PLAN.md Phase 2 item 3: "import the KitchenIQ
-- checklist template NAMES from ARCHITECTURE.md 'Store configuration' as
-- draft checklist_templates"; ARCHITECTURE.md "Store configuration
-- (Farmingdale, captured from live KitchenIQ)": "Checklists: 67 active
-- templates today ... Real names include Safe Count, Breakfast Checklist,
-- Suggestive Selling and Upselling, Pickles Check-in (Smart Shop), FOH -
-- Closing Shift Leader, QIV - Nuggets & Strips, BOH Dishes/Dish Put
-- Back/Boards/Breading/Machines Closing Checklists, Bi-Weekly Clean Prep,
-- Prep Closing, Brand Ambassador WHED/Systems/Outlook Audits, and two
-- catering ones (Catering Follow-Up, Night FOH Catering). Migrate these as
-- templates.").
--
-- Only 18 of the 67 real template names are enumerated in the spec (the
-- "BOH ... Closing Checklists" and "Brand Ambassador ... Audits" groups are
-- expanded below into their individual named checklists); the remaining ~49
-- were never captured and are NOT invented here. Every row is seeded
-- `active = false` (draft): a name alone has no sections/questions yet, so
-- these are placeholders to build out later, not live checklists a shift
-- could accidentally run today. checklist_templates.active is the only
-- status column on this table (no separate draft/published enum), so
-- `active = false` is the "draft" state per PLAN.md's "draft checklist_
-- templates" wording.
--
-- Guarded by name so this migration is safe to apply more than once and
-- won't collide with S1 (Checklists stream, which owns this table) if it
-- later seeds any of these same names for real.

insert into public.checklist_templates (name, description, active)
select v.name, v.description, false
from (
  values
    ('Safe Count', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Breakfast Checklist', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Suggestive Selling and Upselling', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Pickles Check-in (Smart Shop)', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('FOH - Closing Shift Leader', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('QIV - Nuggets & Strips', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('BOH Dishes Closing Checklist', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Dish Put Back Closing Checklist', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Boards Closing Checklist', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Breading Closing Checklist', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Machines Closing Checklist', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Bi-Weekly Clean Prep', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Prep Closing', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Brand Ambassador WHED Audit', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Brand Ambassador Systems Audit', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Brand Ambassador Outlook Audit', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Catering Follow-Up', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).'),
    ('Night FOH Catering', 'Migrated from KitchenIQ (draft placeholder, needs sections/questions).')
) as v(name, description)
where not exists (
  select 1 from public.checklist_templates existing where existing.name = v.name
);

-- Positions/position_groups, the Avondale onboarding roadmap (21 stations),
-- both leadership pipeline stage lists, the starter catering menu, and the
-- per-stage catering checklist defaults called for by this same PLAN.md item
-- are already seeded by earlier migrations (S4's
-- 20260707020100_training_seed.sql and S9's 20260707040100_catering_seed.sql)
-- -- verified via the Supabase Management API before writing this file
-- (checklist_templates count was 0; positions/position_groups/onboarding_
-- roadmaps/roadmap_stations/passports/passport_items/catering_menu_items/
-- catering_checklist_defaults all already had rows). Re-seeding them here
-- would duplicate PLAN.md's "Do NOT duplicate rows already seeded by
-- P0/modules" instruction, so this migration only adds the one missing
-- piece: the checklist_templates names.
