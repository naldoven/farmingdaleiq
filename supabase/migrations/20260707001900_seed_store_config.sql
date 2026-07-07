-- Seed: Farmingdale store configuration
-- ARCHITECTURE.md "Store configuration (Farmingdale, captured from live
-- KitchenIQ)". Real captured values are inserted as-is; anything not yet
-- captured from KitchenIQ is marked SEED-DEFAULT per PLAN.md ground rules
-- so it is findable later.

-- Store -----------------------------------------------------------------
insert into public.stores (name, timezone)
values ('Farmingdale', 'America/New_York');

-- Dayparts (6), real KitchenIQ hours --------------------------------------
insert into public.day_parts (name, start_time, end_time, sort)
values
  ('Morning', '06:00', '11:00', 1),
  ('Lunch', '11:00', '15:00', 2),
  ('Mid', '15:00', '17:00', 3),
  ('Dinner', '17:00', '19:00', 4),
  ('Night', '19:00', '23:00', 5),
  ('Closing', '23:00', '23:45', 6);

-- Roles (10), ranked 1 (highest authority) to 10 (lowest) ------------------
insert into public.roles (name, is_system, rank)
values
  ('Location Manager', true, 1),
  ('Director', true, 2),
  ('Assistant Director', true, 3),
  ('Operations Lead', true, 4),
  ('Shift Supervisor', true, 5),
  ('Team Leader', true, 6),
  ('FOH Trainer', true, 7),
  ('BOH Trainer', true, 8),
  ('FOH Brand Ambassadors', true, 9),
  ('Team Member', true, 10);

-- Role permissions ---------------------------------------------------------
-- SEED-DEFAULT: exact per-role permission differences are an open question
-- (ARCHITECTURE.md "Open questions" #8). This is a sensible cascading
-- default: each tier includes everything below it plus the keys listed.
with base_keys as (
  select unnest(array[
    'people.view', 'checklists.complete', 'tasks.complete', 'setups.view',
    'breaks.view', 'ratings.view', 'training.view', 'waste.log',
    'accountability.view_own', 'tokens.gift', 'rewards.claim', 'feed.post',
    'vendors.view', 'maintenance.request', 'catering.view',
    'notifications.view'
  ]) as permission_key
),
trainer_keys as (
  select permission_key from base_keys
  union select unnest(array['training.stamp', 'ratings.rate'])
),
leader_keys as (
  select permission_key from trainer_keys
  union select unnest(array[
    'tasks.manage', 'setups.post', 'breaks.manage', 'accountability.issue',
    'feed.post_broadcast', 'tokens.award', 'rewards.fulfill',
    'catering.manage', 'maintenance.triage', 'reports.view',
    'checklists.view_reports'
  ])
),
supervisor_keys as (
  select permission_key from leader_keys
  union select unnest(array['setups.manage', 'waste.manage'])
),
ops_lead_keys as (
  select permission_key from supervisor_keys
  union select unnest(array[
    'checklists.manage_templates', 'vendors.manage', 'maintenance.manage',
    'tokens.manage', 'rewards.manage', 'accountability.manage',
    'training.manage'
  ])
),
asst_director_keys as (
  select permission_key from ops_lead_keys
  union select unnest(array[
    'training.org_chart_manage', 'people.manage', 'teams.manage',
    'discord.manage'
  ])
),
director_keys as (
  select permission_key from asst_director_keys
  union select unnest(array['roles.manage', 'settings.manage'])
),
location_manager_keys as (
  select unnest(array[
    'people.manage', 'people.view', 'teams.manage', 'roles.manage',
    'checklists.manage_templates', 'checklists.complete', 'checklists.view_reports',
    'tasks.manage', 'tasks.complete',
    'setups.manage', 'setups.view', 'setups.post',
    'breaks.manage', 'breaks.view',
    'ratings.rate', 'ratings.view',
    'training.manage', 'training.stamp', 'training.view', 'training.org_chart_manage',
    'waste.manage', 'waste.log',
    'accountability.manage', 'accountability.issue', 'accountability.view_own',
    'tokens.manage', 'tokens.award', 'tokens.gift',
    'rewards.manage', 'rewards.claim', 'rewards.fulfill',
    'feed.post_broadcast', 'feed.post',
    'vendors.manage', 'vendors.view',
    'maintenance.manage', 'maintenance.request', 'maintenance.triage',
    'catering.manage', 'catering.view',
    'reports.view', 'settings.manage', 'discord.manage', 'notifications.view'
  ]) as permission_key
)
insert into public.role_permissions (role_id, permission_key)
select r.id, k.permission_key
from public.roles r
join lateral (
  select permission_key from base_keys where r.name in ('Team Member', 'FOH Brand Ambassadors')
  union all
  select permission_key from trainer_keys where r.name in ('FOH Trainer', 'BOH Trainer')
  union all
  select permission_key from leader_keys where r.name = 'Team Leader'
  union all
  select permission_key from supervisor_keys where r.name = 'Shift Supervisor'
  union all
  select permission_key from ops_lead_keys where r.name = 'Operations Lead'
  union all
  select permission_key from asst_director_keys where r.name = 'Assistant Director'
  union all
  select permission_key from director_keys where r.name = 'Director'
  union all
  select permission_key from location_manager_keys where r.name = 'Location Manager'
) k on true;

-- Accountability -------------------------------------------------------------
insert into public.accountability_settings (period_kind, period_days)
values ('rolling', 60);

-- Infraction types + points, real KitchenIQ values (tail of the list is
-- still to be captured per ARCHITECTURE.md "Open questions").
insert into public.infraction_types (name, points, active)
values
  ('Call Out (P3&4)', 10, true),
  ('No Call No Show (P3&4)', 30, true),
  ('Late to Shift 5-30 mins (P3&4)', 4, true),
  ('Excused Call Out', 0, true),
  ('Coaching', 0, true),
  ('Time Theft (P4)', 4, true),
  ('Violation of Standard Procedures (P5&6)', 10, true);

-- Disciplinary ladder (threshold points), real KitchenIQ values
insert into public.disciplinary_action_types (name, threshold_points, sort)
values
  ('Coaching', 10, 1),
  ('Verbal Warning', 15, 2),
  ('Written Warning', 20, 3),
  ('1 Week Suspension', 30, 4),
  ('Employment Review', 50, 5);

-- Rewards (token cost), real KitchenIQ values (tail of the list is still to
-- be captured per ARCHITECTURE.md "Open questions").
insert into public.rewards (name, token_cost, active)
values
  ('Cookie/Brownie (TM)', 25, true),
  ('Drink Cup (TM)', 25, true),
  ('LTO/Iced Coffee (TM)', 40, true),
  ('Treasure Box (TM)', 50, true),
  ('Drink Cup (L)', 50, true),
  ('Medium Side (TM)', 50, true),
  ('Cookie/Brownie (L)', 50, true);

-- Break rule: current real store policy is a single rule (6h -> 30 min).
insert into public.break_rules
  (min_shift_minutes, max_shift_minutes, age_band, rest_minutes_paid, meal_minutes_unpaid, sort)
values
  (360, 1440, 'adult', 0, 30, 1);

-- SEED-DEFAULT: NY-law minor preset, not yet an active store policy but the
-- break engine (S3) is built to support it; store confirmation still needed.
insert into public.break_rules
  (min_shift_minutes, max_shift_minutes, age_band, rest_minutes_paid, meal_minutes_unpaid, sort)
values
  (240, 1440, 'minor', 0, 30, 10);

-- Food items: KitchenIQ tracks two generic holding-compliance items today.
insert into public.food_items (name, cold_min_f, cold_max_f, hot_min_f, hot_max_f)
values
  ('Cold Foods', 33, 41, null, null),
  ('Hot Foods', null, null, 140, 210);

-- SEED-DEFAULT: token earning amounts are an open question
-- (ARCHITECTURE.md "Open questions" #3); Top Performer's default of 20 is
-- explicitly suggested by the spec, task/checklist amounts are a placeholder.
insert into public.token_earning_rules (event_key, amount)
values
  ('task_complete', 5),
  ('checklist_complete', 5),
  ('top_performer', 20);
