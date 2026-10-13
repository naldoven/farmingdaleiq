-- Confirmed from Farmingdale KitchenIQ screenshots supplied 2026-09-26.
-- This is configuration data, not a production write: it is applied only by
-- the normal reviewed migration deployment process.
--
-- Infractions store a point snapshot at issuance, so correcting an infraction
-- type affects future issuance only and does not rewrite past accountability
-- records.

-- The original seed used the preliminary 4-point late type. KitchenIQ shows
-- the corrected name and 5-point value.
update public.infraction_types old_type
set active = false
where old_type.name = 'Late to Shift 5-30 mins (P3&4)'
  and exists (
    select 1
    from public.infraction_types confirmed_type
    where confirmed_type.name = 'Late to Shift (5-30 Mins) (P3&4)'
  );

update public.infraction_types old_type
set name = 'Late to Shift (5-30 Mins) (P3&4)', points = 5, active = true
where old_type.name = 'Late to Shift 5-30 mins (P3&4)'
  and not exists (
    select 1
    from public.infraction_types confirmed_type
    where confirmed_type.name = 'Late to Shift (5-30 Mins) (P3&4)'
  );

update public.infraction_types
set points = 5
where name = 'Late to Shift (5-30 Mins) (P3&4)';

-- Add the types visible in the confirmed KitchenIQ list without duplicating
-- a type that a store administrator may already have entered.
insert into public.infraction_types (name, points, active)
select source.name, source.points, true
from (
  values
    ('Uniform/Appearance 1st Coaching', 0),
    ('Uniform/Appearance 2nd Coaching', 0),
    ('Excused Lateness', 0),
    ('Performance Coaching (P5)', 0),
    ('Missing Thermometer', 1),
    ('Uniform/Appearance Violation (P13-15)', 5),
    ('Late to Shift (30+ Mins) (P3&4)', 8),
    ('Insubordination (P5&6)', 10),
    ('Cash Shortage (Cash & Coupon Policy)', 10),
    ('Performance (P5)', 20),
    ('Food/Property/Money Theft (P6)', 40)
) as source(name, points)
where not exists (
  select 1
  from public.infraction_types existing
  where existing.name = source.name
);

-- KitchenIQ confirms a 10/20/30/40/50 ladder, not the preliminary
-- 10/15/20/30/50 seed.
update public.disciplinary_action_types
set threshold_points = case name
  when 'Coaching' then 10
  when 'Verbal Warning' then 20
  when 'Written Warning' then 30
  when '1 Week Suspension' then 40
  when 'Employment Review' then 50
end
where name in (
  'Coaching',
  'Verbal Warning',
  'Written Warning',
  '1 Week Suspension',
  'Employment Review'
);
