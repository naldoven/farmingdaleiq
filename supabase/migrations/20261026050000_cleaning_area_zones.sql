-- Cleaning zones become areas (Naldo, 2026-10-26, after a phone walkthrough):
-- the store finds things by area (Boards, Machines, Breading), not by the
-- color on the cleaning-zones message, so each area is now its own zone. The
-- color stays on every area as a tag, so the print sheet keeps the paper's
-- color coding, and `areas` now names the color group each area came from
-- (shown under the name in Cleaning settings).
--
-- The six color zones are renamed in place to their first area, so their ids
-- and everything pointing at them survive; the other areas are added beside
-- them. Every step is guarded on the current name, so a re-run changes
-- nothing.

-- Rename the color zones to their first area ---------------------------------

update public.cleaning_zones set name = 'Boards', areas = 'Green group', sort = 1 where name = 'Green';
update public.cleaning_zones set name = 'Breading', areas = 'Yellow group', sort = 3 where name = 'Yellow';
update public.cleaning_zones set name = 'Dish to door', areas = 'Blue group', sort = 5 where name = 'Blue';
update public.cleaning_zones set name = 'Front counter', areas = 'Red group', sort = 7, active = true where name = 'Red';
update public.cleaning_zones set name = 'DT cockpit', areas = 'Purple group', sort = 9, active = true where name = 'Purple';
update public.cleaning_zones set name = 'Dining room', areas = 'Orange group', sort = 10, active = true where name = 'Orange';

-- Add the remaining areas ------------------------------------------------------
-- FOH goes on the board now too (Naldo, 2026-10-26). It has no seeded cleans
-- yet, so nothing changes on the board until FOH items from the walkthrough
-- are approved.

insert into public.cleaning_zones (name, color, side, areas, sort, active)
values
  ('Prep', '#16A34A', 'boh', 'Green group', 2, true),
  ('Machines', '#E0A100', 'boh', 'Yellow group', 4, true),
  ('Dumpster', '#1D4ED8', 'boh', 'Blue group', 6, true),
  ('Vestibule', '#DC2626', 'foh', 'Red group', 8, true),
  ('Patio', '#EA6A0C', 'foh', 'Orange group', 11, true),
  ('Restrooms', '#EA6A0C', 'foh', 'Orange group', 12, true),
  ('Playground', '#EA6A0C', 'foh', 'Orange group', 13, true)
on conflict (name) do nothing;

-- Move the seeded cleans to their area ---------------------------------------
-- Best guess from each clean's name; Mariana corrects any on the master list.
-- Only cleans still in the zone they were seeded into move, so an item a
-- planner has already re-zoned is left alone. Anything not listed stays in
-- the renamed zone (Boards, Breading, Dish to door).

update public.cleaning_items i
   set zone_id = target.id
  from (
    values
      ('Prep shelving', 'Boards', 'Prep'),
      ('Prep white walls', 'Boards', 'Prep'),
      ('Prep lowboys', 'Boards', 'Prep'),
      ('Air vents', 'Breading', 'Machines'),
      ('Holding cabinet', 'Breading', 'Machines'),
      ('Machine vents', 'Breading', 'Machines'),
      ('Clean above machines', 'Breading', 'Machines'),
      ('Machine hood inner', 'Breading', 'Machines'),
      ('Rethermalizer', 'Breading', 'Machines'),
      ('Holding cabinet racks', 'Breading', 'Machines'),
      ('Holding cabinet inner', 'Breading', 'Machines'),
      ('Dumpster pad scrub', 'Dish to door', 'Dumpster'),
      ('Spray the whale', 'Dish to door', 'Dumpster')
  ) as m(item, from_zone, to_zone)
  join public.cleaning_zones source on source.name = m.from_zone
  join public.cleaning_zones target on target.name = m.to_zone
 where lower(i.name) = lower(m.item)
   and i.zone_id = source.id;
