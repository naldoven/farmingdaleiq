-- SEED-DEFAULT: Catering per-stage checklist defaults and a starter menu
-- catalog (PLAN.md S9: "Seed Avondale default checklist items + a starter
-- menu as SEED-DEFAULT"; ARCHITECTURE.md "Open questions" #14: Farmingdale's
-- real catering menu with component breakdowns has not yet been captured
-- from EZCater/the CFA catering site). Modeled on the Avondale Catering Hub
-- checklist copy quoted in ARCHITECTURE.md "Catering" and the KitchenIQ
-- catering checklists already in use (Catering Follow-Up, Night FOH
-- Catering) -- replace with real Farmingdale values once captured.

insert into public.catering_checklist_defaults (stage, label, sort, active)
values
  -- Confirmation call
  ('confirm', 'Called guest to confirm', 0, true),
  ('confirm', 'Date and time confirmed', 1, true),
  ('confirm', 'Headcount confirmed', 2, true),
  ('confirm', 'Menu confirmed', 3, true),
  ('confirm', 'Payment confirmed', 4, true),
  -- FOH setup
  ('setup', 'Serving utensils out', 0, true),
  ('setup', 'Sauces stocked', 1, true),
  ('setup', 'Dressings stocked', 2, true),
  ('setup', 'Toppings stocked', 3, true),
  ('setup', 'Chips stocked', 4, true),
  -- Kitchen prep
  ('kitchen_prep', 'Food items prepped', 0, true),
  ('kitchen_prep', 'Sauces packed', 1, true),
  ('kitchen_prep', 'Paper goods packed', 2, true),
  ('kitchen_prep', 'Drinks packed', 3, true),
  ('kitchen_prep', 'Utensils and napkins packed', 4, true),
  ('kitchen_prep', 'Special requests noted', 5, true),
  -- Pickup/delivery handoff
  ('out', 'Tender count confirmed', 0, true),
  ('out', 'All food packed', 1, true),
  ('out', 'Cold items from the cooler', 2, true),
  ('out', 'Sauces and condiments included', 3, true),
  ('out', 'Drinks and ice packed', 4, true);

insert into public.catering_menu_items (name, category, components, scaling_rules, active)
values
  (
    '8-Count Nugget Tray',
    'Trays',
    '[{"name": "Chicken Nuggets (8ct)", "qty": 1}]'::jsonb,
    '[{"label": "Sauce packets", "perHeadcount": 2, "perQty": 0}]'::jsonb,
    true
  ),
  (
    'Chicken Sandwich Boxed Meal',
    'Boxed Meals',
    '[{"name": "Chicken Sandwich", "qty": 1}, {"name": "Chips", "qty": 1}, {"name": "Cookie", "qty": 1}]'::jsonb,
    '[{"label": "Napkins", "perHeadcount": 0, "perQty": 1}, {"label": "Sauce packets", "perHeadcount": 0, "perQty": 2}]'::jsonb,
    true
  ),
  (
    '100-Count Nugget Tray',
    'Trays',
    '[{"name": "Chicken Nuggets (100ct)", "qty": 1}]'::jsonb,
    '[{"label": "Sauce packets", "perHeadcount": 3, "perQty": 0}]'::jsonb,
    true
  ),
  (
    'Gallon Beverage',
    'Beverages',
    '[{"name": "Beverage (gallon)", "qty": 1}]'::jsonb,
    '[{"label": "Cups", "perHeadcount": 1, "perQty": 0}, {"label": "Ice", "perHeadcount": 1, "perQty": 0}]'::jsonb,
    true
  ),
  (
    'Fruit Tray',
    'Trays',
    '[{"name": "Fresh Fruit Tray", "qty": 1}]'::jsonb,
    '[]'::jsonb,
    true
  );
