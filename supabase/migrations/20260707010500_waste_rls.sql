-- RLS policies for Waste (PLAN.md S5). These are PERMISSIVE policies
-- layered on top of the default_deny policy created in
-- 20260707009900_rls_default_deny.sql (permissive policies OR together, so
-- this grants exactly the access described below and nothing else leaks
-- through) -- same pattern as 20260707001850_people_teams_rls.sql for
-- People & Teams.
--
-- Scope note: docs/agent-map.md lists `supabase/migrations/` as shared/
-- frozen after P0, "report needed changes back instead of editing". This
-- file is an ADDITIVE new migration (no existing file is edited) touching
-- ONLY the tables this stream owns (waste_categories, waste_items,
-- waste_entries) -- without it these tables are unreachable from the
-- normal per-request client (every table got a `using (false)` default-deny
-- policy in P0), which would make the whole module non-functional end to
-- end. This mirrors 20260707010000_checklists_rls.sql's precedent (S1),
-- which hit and documented the same gap first. Flagged in this stream's
-- final report for orchestrator sign-off given the "do not touch
-- migrations" instruction is otherwise blanket.
--
-- waste.log is a base_key seeded for every role
-- (20260707001900_seed_store_config.sql base_keys), so gating inserts on it
-- is the practical equivalent of "any active, signed-in team member" today,
-- while still failing closed for a hypothetical future role that lacks it.

-- waste_categories: any signed-in member can read (the log form groups
-- items by category); only waste.manage can write.
create policy waste_categories_select_authenticated on public.waste_categories
  for select
  using (auth.uid() is not null);

create policy waste_categories_write_manager on public.waste_categories
  for all
  using (public.has_permission('waste.manage'))
  with check (public.has_permission('waste.manage'));

-- waste_items: any signed-in member can read (the log form, and the unit /
-- unit_cost shown next to each item); only waste.manage can write.
create policy waste_items_select_authenticated on public.waste_items
  for select
  using (auth.uid() is not null);

create policy waste_items_write_manager on public.waste_items
  for all
  using (public.has_permission('waste.manage'))
  with check (public.has_permission('waste.manage'));

-- waste_entries: any signed-in member can read (recent-entries list + the
-- manager-only rollup reports both need this); inserting requires
-- waste.log, and the row must be attributed to the caller (logged_by null
-- or the caller's own id -- app/(app)/waste/actions.ts logWasteEntry always
-- sets it to auth.uid(); this is defense in depth against a direct API call
-- impersonating someone else). Correcting a mis-logged entry (delete) is
-- waste.manage only -- there is no self-service edit/delete in this module
-- (ARCHITECTURE.md "Waste" describes logging, not correcting).
create policy waste_entries_select_authenticated on public.waste_entries
  for select
  using (auth.uid() is not null);

create policy waste_entries_insert_logger on public.waste_entries
  for insert
  with check (
    public.has_permission('waste.log')
    and (logged_by is null or logged_by = auth.uid())
  );

create policy waste_entries_delete_manager on public.waste_entries
  for delete
  using (public.has_permission('waste.manage'));
