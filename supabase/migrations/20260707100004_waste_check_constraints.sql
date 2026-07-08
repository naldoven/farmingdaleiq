-- FIQ parity R54 (Waste, MED): waste quantity and unit_cost were validated only
-- in the app layer. The columns had no CHECK and RLS does not check positivity,
-- so a direct PostgREST insert could write a negative quantity or cost and
-- corrupt the food-cost rollups. Add DB-level CHECK constraints as the backstop.
--
-- Live data verified clean before applying (0 rows violate either constraint).
-- Idempotent: drop-constraint-if-exists before add.

alter table public.waste_entries
  drop constraint if exists waste_entries_quantity_positive;
alter table public.waste_entries
  add constraint waste_entries_quantity_positive check (quantity > 0);

alter table public.waste_items
  drop constraint if exists waste_items_unit_cost_nonneg;
alter table public.waste_items
  add constraint waste_items_unit_cost_nonneg check (unit_cost is null or unit_cost >= 0);
