-- Manager-controlled ordering for waste items. waste_categories has had a
-- `sort` column since the original schema (20260707000900_waste.sql) but
-- waste_items never did, so the /waste log grid and the Admin items list could
-- only ever sort alphabetically -- there was no way to put the high-volume
-- items first. The Admin tab now exposes reorder controls (components/waste/
-- item-manager.tsx -> reorderItems in app/(app)/waste/actions.ts), which write
-- each item's position within its category into this column.
--
-- Backfilled to the current alphabetical-within-category order (matching the
-- `.order("name")` the app used until now) so nothing visibly moves until a
-- manager reorders on purpose. New items are appended at the end of their
-- category by createItem rather than defaulting to 0, which would prepend.

alter table public.waste_items
  add column if not exists sort integer not null default 0;

update public.waste_items i
set sort = ranked.rn
from (
  select
    id,
    row_number() over (
      partition by category_id
      order by lower(name)
    ) - 1 as rn
  from public.waste_items
) ranked
where i.id = ranked.id;
