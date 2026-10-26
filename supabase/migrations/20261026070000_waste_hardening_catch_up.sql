-- Waste hardening, catch-up: 20260801000000_waste_hardening.sql never reached
-- the live database.
--
-- Found 2026-10-26 by reading the live catalog directly. The live migration
-- history has no entries before 2026-08-03 at all (the original schema was
-- applied without being recorded), so a missing history row alone proved
-- nothing. The objects themselves showed it: waste_items.category_id still
-- cascaded, waste_entries.logged_by had no delete rule, is_active_profile()
-- did not exist, the three waste select policies were still bare
-- `auth.uid() is not null`, the insert policy still allowed an unattributed
-- row, and none of the checks or indexes existed. The other early-August
-- files missing from the history (equipment reference import, vendor delivery
-- days, public maintenance portal) were checked the same way and are live.
--
-- This restates sections 1-7 and 9 of that file unchanged, so the live
-- database ends where the repo always said it was. Live data was checked
-- against every new constraint first: 31 items, 193 entries, 2 categories,
-- zero rows in violation and zero unattributed entries, so each ADD applies
-- without a backfill. The deployed waste actions already insert with
-- logged_by = the signed-in user and the default logged_at, and pre-check a
-- category's items before deleting it, so no working flow changes.
--
-- Section 8 (the app_events insert policy) is deliberately left out: it went
-- live on 2026-10-26 when 20261026060000_catering_driver_reservations.sql
-- restated that policy with the waste branches included, and restating the
-- 2026-08-01 version here would drop the driver event keys.
--
-- Idempotent like the original (drop-if-exists before every add), so on a
-- fresh database that already ran 20260801000000 this is a no-op in effect.

-- 1. Category delete must not destroy its items ------------------------------
-- RESTRICT makes the database enforce what the category dialog always claimed.
alter table public.waste_items
  drop constraint if exists waste_items_category_id_fkey;
alter table public.waste_items
  add constraint waste_items_category_id_fkey
  foreign key (category_id) references public.waste_categories(id) on delete restrict;

-- 2. Offboarding must not be blocked by waste history ------------------------
-- SET NULL keeps the cost history while releasing a departing employee.
alter table public.waste_entries
  drop constraint if exists waste_entries_logged_by_fkey;
alter table public.waste_entries
  add constraint waste_entries_logged_by_fkey
  foreign key (logged_by) references public.profiles(id) on delete set null;

-- 3. Bound unit_cost ---------------------------------------------------------
-- The upper bound also rejects NaN and Infinity, which `>= 0` admitted. Keep in
-- sync with WASTE_UNIT_COST_MAX in app/(app)/waste/constants.ts.
alter table public.waste_items
  drop constraint if exists waste_items_unit_cost_nonneg;
alter table public.waste_items
  drop constraint if exists waste_items_unit_cost_bounded;
alter table public.waste_items
  add constraint waste_items_unit_cost_bounded
  check (unit_cost is null or (unit_cost >= 0 and unit_cost <= 1000));

-- 4. Names must be non-empty; notes must be bounded --------------------------
alter table public.waste_categories
  drop constraint if exists waste_categories_name_not_blank;
alter table public.waste_categories
  add constraint waste_categories_name_not_blank check (btrim(name) <> '');

alter table public.waste_items
  drop constraint if exists waste_items_name_not_blank;
alter table public.waste_items
  add constraint waste_items_name_not_blank check (btrim(name) <> '');

alter table public.waste_entries
  drop constraint if exists waste_entries_note_length;
alter table public.waste_entries
  add constraint waste_entries_note_length check (note is null or length(note) <= 500);

-- 5. Close the uncategorized-duplicate hole ----------------------------------
drop index if exists public.waste_items_uncategorized_name_lower_uq;
create unique index waste_items_uncategorized_name_lower_uq
  on public.waste_items (lower(name))
  where category_id is null;

-- 6. Reads require an ACTIVE profile -----------------------------------------
-- A deactivated employee with an unexpired session could still read every
-- item cost and entry. SECURITY DEFINER so it does not re-enter profiles' RLS.
create or replace function public.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

revoke all on function public.is_active_profile() from public;
-- anon as well as authenticated: the select policies below have no `to`
-- clause, so they are evaluated for anon too, and without the grant a
-- logged-out read would error instead of returning no rows. The function
-- returns false for anon, so it grants no data access (allowlisted in
-- lib/supabase/security-definer-access.test.ts).
grant execute on function public.is_active_profile() to anon, authenticated;

drop policy if exists waste_categories_select_authenticated on public.waste_categories;
create policy waste_categories_select_authenticated on public.waste_categories
  for select using (public.is_active_profile());

drop policy if exists waste_items_select_authenticated on public.waste_items;
create policy waste_items_select_authenticated on public.waste_items
  for select using (public.is_active_profile());

drop policy if exists waste_entries_select_authenticated on public.waste_entries;
create policy waste_entries_select_authenticated on public.waste_entries
  for select using (public.is_active_profile());

-- 7. Every new entry is attributed, and not post-dated -----------------------
-- Tightens INSERT only; logged_by stays nullable so section 2 can still
-- release a departing employee.
drop policy if exists waste_entries_insert_logger on public.waste_entries;
create policy waste_entries_insert_logger on public.waste_entries
  for insert with check (
    public.has_permission('waste.log')
    and logged_by = auth.uid()
    and logged_at <= now() + interval '1 hour'
  );

-- 9. Indexes for the hot read paths ------------------------------------------
create index if not exists waste_entries_logged_at_idx
  on public.waste_entries (logged_at desc);
create index if not exists waste_entries_item_id_idx
  on public.waste_entries (item_id);
