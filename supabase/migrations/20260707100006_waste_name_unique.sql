-- FIQ parity R100 (Waste, LOW): there was no uniqueness on category or item
-- names, so duplicates ("Fries" vs "fries") split into confusing separate rollup
-- rows. Enforce case-insensitive uniqueness at the DB: category names are unique
-- store-wide, item names are unique within their category.
--
-- Live data verified clean before applying (0 duplicate category or item names).
-- Idempotent: create-unique-index-if-not-exists.

create unique index if not exists waste_categories_name_lower_uq
  on public.waste_categories (lower(name));

create unique index if not exists waste_items_category_name_lower_uq
  on public.waste_items (category_id, lower(name));
