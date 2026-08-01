-- Waste hardening: audit findings from the pre-rollout review.
--
-- Live data verified clean against every new constraint before writing this
-- (0 rows violate any of them), so each ADD below applies without a backfill.
-- Every statement is idempotent (drop-if-exists before add) so a re-run or a
-- fresh `supabase db reset` behaves identically.

-- 1. Category delete must not destroy its items ------------------------------
--
-- waste_items.category_id was ON DELETE CASCADE, so deleting a category
-- silently deleted every item in it -- names, units, and unit costs -- while
-- components/waste/category-manager.tsx promised "It must have no items left in
-- it." The only thing that ever blocked the delete was the waste_entries FK one
-- level down, which bites only after waste has actually been logged; on a
-- freshly configured category the delete succeeded and took the whole item
-- configuration with it, with no undo.
--
-- RESTRICT makes the database enforce what the UI always claimed.
alter table public.waste_items
  drop constraint if exists waste_items_category_id_fkey;
alter table public.waste_items
  add constraint waste_items_category_id_fkey
  foreign key (category_id) references public.waste_categories(id) on delete restrict;

-- 2. Offboarding must not be blocked by waste history ------------------------
--
-- waste_entries.logged_by had no ON DELETE clause (NO ACTION). Because
-- profiles.id -> auth.users(id) is ON DELETE CASCADE, deleting the AUTH user
-- cascaded into profiles and then tripped this FK, aborting the whole delete
-- with an opaque 23503. Any employee -- or QA test account -- who had ever
-- logged waste became permanently undeletable.
--
-- SET NULL keeps the waste row (the cost history is the point) while releasing
-- the person. Attribution is not lost outright: the waste_logged app_event
-- carries actor_id and survives independently.
alter table public.waste_entries
  drop constraint if exists waste_entries_logged_by_fkey;
alter table public.waste_entries
  add constraint waste_entries_logged_by_fkey
  foreign key (logged_by) references public.profiles(id) on delete set null;

-- 3. Bound unit_cost ---------------------------------------------------------
--
-- 20260718000200 bounded quantity but left unit_cost -- the other factor in
-- every rollup -- with only a nonnegative check. Postgres orders numeric NaN
-- ABOVE all values, so `unit_cost >= 0` also admitted 'NaN' and 'Infinity' via
-- raw PostgREST, which rendered as "$NaN.NaN" across every report. An upper
-- bound rejects all three (NaN <= 1000 is false), exactly as the quantity bound
-- does. Keep in sync with WASTE_UNIT_COST_MAX in app/(app)/waste/constants.ts.
alter table public.waste_items
  drop constraint if exists waste_items_unit_cost_nonneg;
alter table public.waste_items
  drop constraint if exists waste_items_unit_cost_bounded;
alter table public.waste_items
  add constraint waste_items_unit_cost_bounded
  check (unit_cost is null or (unit_cost >= 0 and unit_cost <= 1000));

-- 4. Names must be non-empty; notes must be bounded --------------------------
--
-- Both were app-layer only (zod .trim().min(1) / .max(500)), so a direct
-- PostgREST write could store '' or '   ' as an item name -- which then renders
-- as a blank row in every picker and rollup -- or an unbounded note.
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
--
-- 20260707100006 made items unique on (category_id, lower(name)), but Postgres
-- treats NULLs as distinct, so two uncategorized items could share a name at
-- the DB level even though the app rejects it. A partial index covers exactly
-- the NULL-category case, making the two layers agree.
drop index if exists public.waste_items_uncategorized_name_lower_uq;
create unique index waste_items_uncategorized_name_lower_uq
  on public.waste_items (lower(name))
  where category_id is null;

-- 6. Reads require an ACTIVE profile -----------------------------------------
--
-- All three waste select policies were bare `auth.uid() is not null`: no store
-- scoping, no permission key, and crucially no active check. has_permission()
-- requires profiles.active, but the select policies never called it, so a
-- deactivated employee holding an unexpired JWT could still read the entire
-- food-cost picture -- every item cost, every entry, and who logged it -- via
-- raw PostgREST.
--
-- SECURITY DEFINER so evaluating it does not re-enter profiles' own RLS.
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
-- Granted to anon as well as authenticated: the three select policies below
-- carry no `to authenticated` clause (matching the originals they replace), so
-- they are also evaluated for anon. Without the anon grant an unauthenticated
-- PostgREST read would raise 42501 "permission denied for function" instead of
-- simply returning no rows. The function itself still returns false for anon
-- (auth.uid() is null), so this grants no data access.
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
--
-- The insert policy permitted `logged_by is null`, so a direct PostgREST call
-- could write an anonymous entry -- and since waste_entries has no UPDATE
-- policy at all, nobody could ever repair it. logged_at was likewise
-- unconstrained, so a far-future timestamp would pin itself to the top of every
-- user's Log tab permanently while being excluded from the reports.
--
-- Note this tightens INSERT only. logged_by stays nullable so the ON DELETE SET
-- NULL in section 2 can still release a departing employee.
drop policy if exists waste_entries_insert_logger on public.waste_entries;
create policy waste_entries_insert_logger on public.waste_entries
  for insert with check (
    public.has_permission('waste.log')
    and logged_by = auth.uid()
    and logged_at <= now() + interval '1 hour'
  );

-- 8. Gate the new waste audit events -----------------------------------------
--
-- app_events_insert_authenticated falls through to `true` for unlisted keys, so
-- a waste.log-only user could forge a waste_item_changed row and pollute the
-- audit trail that section 2's attribution now depends on. Pin each new key to
-- the permission its action already requires.
drop policy if exists app_events_insert_authenticated on public.app_events;
create policy app_events_insert_authenticated on public.app_events
  for insert to authenticated with check (
    case event_key
      when 'recognition' then public.has_permission('tokens.award')
      when 'gift_sent' then public.has_permission('tokens.gift')
      when 'reward_claim' then public.has_permission('rewards.claim')
      when 'top_performer' then public.has_permission('setups.post')
      when 'broadcast' then public.has_permission('feed.post_broadcast')
      when 'infraction_issued' then
        (public.has_permission('accountability.issue') or public.has_permission('accountability.manage'))
      when 'disciplinary_triggered' then
        (public.has_permission('accountability.issue') or public.has_permission('accountability.manage'))
      when 'waste_logged' then public.has_permission('waste.log')
      when 'waste_entry_deleted' then public.has_permission('waste.manage')
      when 'waste_item_changed' then public.has_permission('waste.manage')
      when 'waste_category_changed' then public.has_permission('waste.manage')
      else true
    end
  );

-- 9. Indexes for the hot read paths ------------------------------------------
--
-- /waste orders by logged_at desc on every load and the reports join entries to
-- items; neither column was indexed. Cheap now, and avoids a sequential scan
-- once a year of entries has accumulated.
create index if not exists waste_entries_logged_at_idx
  on public.waste_entries (logged_at desc);
create index if not exists waste_entries_item_id_idx
  on public.waste_entries (item_id);
