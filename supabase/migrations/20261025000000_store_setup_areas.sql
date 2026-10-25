-- Store setup confirmations (docs/STORE-SETUP.md).
--
-- The app shipped with Avondale guesses marked SEED-DEFAULT (positions,
-- waste costs, token amounts, passports, org chart, catering menu, and so
-- on). A manager finishes setup from a phone over a few shifts, area by
-- area, and records "this area is now real" here. One row per area key
-- (lib/store-setup/areas.ts is the list); a missing row means "still
-- default". The Store setup page (/settings/setup) reads it and the editors
-- show a "Default, not confirmed" tag while the row is absent.
--
-- Idempotent by design: marking the same area twice upserts the same key,
-- and marking it default again deletes the row. No history is kept; the
-- audit trail for the values themselves lives in the module tables.

create table public.store_setup_areas (
  area_key text primary key,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id)
);

alter table public.store_setup_areas enable row level security;

-- Any signed-in member can read: every editor page shows the "Default, not
-- confirmed" tag, and those pages are reachable by roles below settings.manage
-- (a trainer on /training, a shift leader on /waste).
create policy store_setup_areas_select_authenticated on public.store_setup_areas
  for select using (auth.uid() is not null);

-- Only settings.manage (Director and Location Manager in the seed) can mark an
-- area confirmed or back to default. Server actions in
-- app/(app)/settings/setup/actions.ts call requirePermission('settings.manage')
-- first; this policy is the backstop.
create policy store_setup_areas_write_manager on public.store_setup_areas
  for all
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
