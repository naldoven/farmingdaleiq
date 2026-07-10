-- Seed: real Farmingdale waste items from the store's live KitchenIQ waste
-- settings (captured from Naldo's screenshots, 2026-07-09). 2 categories
-- (Primary, Secondary) and 31 items. KitchenIQ's "ct" measure maps to unit
-- 'each' and "oz" to 'oz'; the KitchenIQ Cost column becomes unit_cost. The
-- per-item measure weight and the active toggle have no column in waste_items,
-- so they are dropped.
--
-- Idempotent + non-destructive: categories insert only if the (case-insensitive)
-- name is new; items upsert on (category_id, lower(name)) so re-running refreshes
-- unit/cost without duplicating, and it never deletes an item that already has
-- logged waste_entries.

do $$
declare cat_primary uuid; cat_secondary uuid;
begin
  insert into public.waste_categories (name, sort) values ('Primary', 0)
    on conflict (lower(name)) do nothing;
  insert into public.waste_categories (name, sort) values ('Secondary', 1)
    on conflict (lower(name)) do nothing;

  select id into cat_primary   from public.waste_categories where lower(name) = 'primary';
  select id into cat_secondary from public.waste_categories where lower(name) = 'secondary';

  insert into public.waste_items (category_id, name, unit, unit_cost) values
    -- Primary
    (cat_primary, 'Filet',               'each', 5.84),
    (cat_primary, 'Spicy Filet',         'each', 6.14),
    (cat_primary, 'Grilled Filet',       'each', 6.54),
    (cat_primary, 'Grilled Spicy Filet', 'each', 6.54),
    (cat_primary, 'Bacon',               'oz',   0.66),
    (cat_primary, 'Mac & Cheese',        'oz',   0.11),
    (cat_primary, 'Kale Crunch',         'each', 0.10),
    (cat_primary, 'Small Fruit Cup',     'each', 0.10),
    (cat_primary, 'Medium Fruit Cup',    'each', 0.10),
    (cat_primary, 'Large Fruit Cup',     'each', 0.10),
    (cat_primary, 'Parfaits',            'each', 0.10),
    (cat_primary, 'Side Salad',          'each', 0.10),
    (cat_primary, 'Market Salad',        'each', 0.10),
    (cat_primary, 'Southwest Salad',     'each', 0.10),
    (cat_primary, 'Cobb Salads',         'each', 0.10),
    (cat_primary, 'Cool Wraps',          'each', 0.10),
    -- Secondary
    (cat_secondary, 'Nuggets',                 'each', 0.77),
    (cat_secondary, 'Strips',                  'each', 1.99),
    (cat_secondary, 'Grilled Nuggets',         'each', 0.87),
    (cat_secondary, 'Breakfast Filet',         'each', 2.50),
    (cat_secondary, 'Spicy Breakfast Filet',   'each', 2.76),
    (cat_secondary, 'Grilled Breakfast Filet', 'each', 2.56),
    (cat_secondary, 'Sausage',                 'each', 0.10),
    (cat_secondary, 'Mini Bread',              'each', 0.10),
    (cat_secondary, 'Biscuit',                 'each', 1.89),
    (cat_secondary, 'Yellow Folded',           'each', 0.70),
    (cat_secondary, 'Scrambled',               'each', 0.70),
    (cat_secondary, 'Egg White',               'each', 0.90),
    (cat_secondary, 'Hashbrown',               'each', 1.99),
    (cat_secondary, 'Chicken Noodle Soup',     'oz',   1.16),
    (cat_secondary, 'Tortilla Soup',           'oz',   1.15)
  on conflict (category_id, lower(name)) do update
    set unit = excluded.unit, unit_cost = excluded.unit_cost;
end $$;
