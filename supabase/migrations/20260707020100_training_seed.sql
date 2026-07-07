-- SEED-DEFAULT content for S4 Ratings, passports, talent lifecycle
-- (PLAN.md ground rules: "Where a Farmingdale value is unknown, seed the
-- Avondale default and mark it SEED-DEFAULT so it is findable later";
-- ARCHITECTURE.md "Open questions" #1 positions, #6 org chart, #4 training).
--
-- Every insert below is guarded ("insert ... select ... where not exists")
-- so this migration is safe to apply more than once and safe to merge in
-- any order relative to a future stream that seeds its own positions (e.g.
-- S3 Setups, which owns the setup-board UI built on top of position_groups/
-- positions -- see docs/agent-map.md's footnote on that table). If S3 (or
-- anyone) seeds position_groups/positions first, these guards make this
-- file's position seeding a no-op and only the training-specific tables
-- (onboarding_roadmaps, roadmap_stations linked by name, org_tiers,
-- leadership passports) still apply -- flagged in this stream's report for
-- orchestrator reconciliation once S3 lands with its own station list.

-- ---------------------------------------------------------------------------
-- Positions: Avondale FOH station list (21 stations), grouped under one
-- "FOH" position_group. Only the phase groupings/some names are given
-- verbatim in ARCHITECTURE.md ("Onboarding, Ordering (Register 1/2, iPOS
-- 1/2), Assembly (FC Bag, DTD, DT Bag), Staging (Mobile Cash, STAR), and
-- Delivery (Expo, Serving, Dining, Mobile Host, FHK)"); the Onboarding-phase
-- station names are not enumerated in the spec, so a reasonable generic set
-- fills that phase to reach the stated total of 21. All SEED-DEFAULT.
-- ---------------------------------------------------------------------------
insert into public.position_groups (name, sort)
select 'FOH', 1
where not exists (select 1 from public.position_groups where name = 'FOH');

do $$
declare
  foh_group_id uuid;
  station text[];
  stations text[][] := array[
    -- [name, sort]
    ['Orientation', '10'],
    ['Handbook & Policies', '11'],
    ['Food Safety Basics', '12'],
    ['Uniform & Grooming', '13'],
    ['POS Basics', '14'],
    ['Hospitality Basics', '15'],
    ['Store Tour & Safety', '16'],
    ['Register 1', '20'],
    ['Register 2', '21'],
    ['iPOS 1', '22'],
    ['iPOS 2', '23'],
    ['FC Bag', '30'],
    ['DTD', '31'],
    ['DT Bag', '32'],
    ['Mobile Cash', '40'],
    ['STAR', '41'],
    ['Expo', '50'],
    ['Serving', '51'],
    ['Dining', '52'],
    ['Mobile Host', '53'],
    ['FHK', '54']
  ];
begin
  select id into foh_group_id from public.position_groups where name = 'FOH';

  foreach station slice 1 in array stations
  loop
    insert into public.positions (group_id, name, sort)
    select foh_group_id, station[1], station[2]::int
    where not exists (select 1 from public.positions where name = station[1]);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Onboarding roadmap: FOH, 21 stations grouped into the 5 named phases.
-- Kitchen roadmap is left as an inactive placeholder (station list is an
-- open question per ARCHITECTURE.md -- BOH stations were never enumerated).
-- ---------------------------------------------------------------------------
insert into public.onboarding_roadmaps (side, name, active)
select 'foh', 'FOH Onboarding Roadmap', true
where not exists (
  select 1 from public.onboarding_roadmaps where side = 'foh' and name = 'FOH Onboarding Roadmap'
);

insert into public.onboarding_roadmaps (side, name, active)
select 'kitchen', 'Kitchen Onboarding Roadmap', false
where not exists (
  select 1 from public.onboarding_roadmaps where side = 'kitchen' and name = 'Kitchen Onboarding Roadmap'
);

do $$
declare
  v_roadmap_id uuid;
  phase_map text[][] := array[
    -- [station name, phase, sort]
    ['Orientation', 'Onboarding', '10'],
    ['Handbook & Policies', 'Onboarding', '11'],
    ['Food Safety Basics', 'Onboarding', '12'],
    ['Uniform & Grooming', 'Onboarding', '13'],
    ['POS Basics', 'Onboarding', '14'],
    ['Hospitality Basics', 'Onboarding', '15'],
    ['Store Tour & Safety', 'Onboarding', '16'],
    ['Register 1', 'Ordering', '20'],
    ['Register 2', 'Ordering', '21'],
    ['iPOS 1', 'Ordering', '22'],
    ['iPOS 2', 'Ordering', '23'],
    ['FC Bag', 'Assembly', '30'],
    ['DTD', 'Assembly', '31'],
    ['DT Bag', 'Assembly', '32'],
    ['Mobile Cash', 'Staging', '40'],
    ['STAR', 'Staging', '41'],
    ['Expo', 'Delivery', '50'],
    ['Serving', 'Delivery', '51'],
    ['Dining', 'Delivery', '52'],
    ['Mobile Host', 'Delivery', '53'],
    ['FHK', 'Delivery', '54']
  ];
  row_ text[];
  pos_id uuid;
begin
  select id into v_roadmap_id from public.onboarding_roadmaps where side = 'foh' and name = 'FOH Onboarding Roadmap';

  foreach row_ slice 1 in array phase_map
  loop
    select id into pos_id from public.positions where name = row_[1];
    if pos_id is not null then
      insert into public.roadmap_stations (roadmap_id, position_id, phase, sort)
      select v_roadmap_id, pos_id, row_[2], row_[3]::int
      where not exists (
        select 1 from public.roadmap_stations rs
        where rs.roadmap_id = v_roadmap_id and rs.position_id = pos_id
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Org chart: Farmingdale's own tiers/goal counts are an open question
-- (ARCHITECTURE.md #6); placeholders below mirror the seeded role ladder so
-- the org chart has something real to render on day one.
-- ---------------------------------------------------------------------------
insert into public.org_tiers (department, name, goal_count, sort)
select v.department, v.name, v.goal_count, v.sort
from (values
  ('foh', 'Team Leaders', 3, 10),
  ('foh', 'Shift Supervisors', 2, 20),
  ('kitchen', 'BOH Trainers', 2, 10),
  ('store', 'Operations Leads', 1, 10),
  ('store', 'Assistant Directors', 1, 20)
) as v(department, name, goal_count, sort)
where not exists (
  select 1 from public.org_tiers where department = v.department and name = v.name
);

-- ---------------------------------------------------------------------------
-- Leadership pipelines (Masters + Leads), stage lists per
-- ARCHITECTURE.md "Trainee lifecycle": "Avondale's Masters run: Apply,
-- Orientation, Review, Mock Train, Quiz, Touchpoint, Promote; leads run:
-- Apply, Workbook, Field weeks 1 to 3, Mock, Promote." Stamping the final
-- stage auto-upgrades the person's role (target_role_id) and fills an org
-- slot (org_tier_id) -- both mappings below are SEED-DEFAULT assumptions
-- (which role/tier a pipeline promotion should land on is not specified).
-- ---------------------------------------------------------------------------
insert into public.passports (kind, name, active, target_role_id, org_tier_id)
select
  'leadership',
  'FOH Masters Pipeline',
  true,
  (select id from public.roles where name = 'FOH Trainer'),
  (select id from public.org_tiers where name = 'Team Leaders' and department = 'foh')
where not exists (select 1 from public.passports where name = 'FOH Masters Pipeline');

insert into public.passports (kind, name, active, target_role_id, org_tier_id)
select
  'leadership',
  'Leads Pipeline',
  true,
  (select id from public.roles where name = 'Team Leader'),
  (select id from public.org_tiers where name = 'Team Leaders' and department = 'foh')
where not exists (select 1 from public.passports where name = 'Leads Pipeline');

do $$
declare
  masters_id uuid;
  leads_id uuid;
  stage text;
  i int;
  masters_stages text[] := array['Apply', 'Orientation', 'Review', 'Mock Train', 'Quiz', 'Touchpoint', 'Promote'];
  leads_stages text[] := array['Apply', 'Workbook', 'Field Week 1', 'Field Week 2', 'Field Week 3', 'Mock', 'Promote'];
begin
  select id into masters_id from public.passports where name = 'FOH Masters Pipeline';
  select id into leads_id from public.passports where name = 'Leads Pipeline';

  if masters_id is not null then
    i := 0;
    foreach stage in array masters_stages loop
      i := i + 1;
      insert into public.passport_items (passport_id, sort, type, label)
      select masters_id, i, 'check', stage
      where not exists (
        select 1 from public.passport_items where passport_id = masters_id and label = stage
      );
    end loop;
  end if;

  if leads_id is not null then
    i := 0;
    foreach stage in array leads_stages loop
      i := i + 1;
      insert into public.passport_items (passport_id, sort, type, label)
      select leads_id, i, 'check', stage
      where not exists (
        select 1 from public.passport_items where passport_id = leads_id and label = stage
      );
    end loop;
  end if;
end $$;
