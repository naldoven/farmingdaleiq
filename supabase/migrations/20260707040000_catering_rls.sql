-- RLS policies for Catering (PLAN.md S9). These are PERMISSIVE policies
-- layered on top of the default_deny policy created in
-- 20260707009900_rls_default_deny.sql (permissive policies OR together, so
-- this grants exactly the access described below and nothing else leaks
-- through) -- same pattern as 20260707001850_people_teams_rls.sql for
-- People & Teams and the sibling P1 streams' own *_rls.sql files.
--
-- Scope note: docs/agent-map.md lists `supabase/migrations/` as shared/frozen
-- after P0, "report needed changes back instead of editing". This file is an
-- ADDITIVE new migration (no existing file is edited) touching ONLY the
-- tables this stream owns (all `catering_*` tables) -- without it those
-- tables are unreachable from the normal per-request client (every table
-- got a `using (false)` default-deny policy in P0), which would make the
-- whole module non-functional end to end. Flagged in this stream's final
-- report for orchestrator sign-off, matching the precedent already set by
-- the Checklists/Waste/Training/Accountability/Tokens streams.
--
-- Permission model: `catering.view` is granted to every seeded role (base
-- tier, see 20260707001900_seed_store_config.sql), so any signed-in active
-- team member can read the pipeline/queues/history/analytics for staffing
-- and prep awareness. `catering.manage` (leader tier and above) is required
-- for every write -- creating/editing orders, moving stages, checklist
-- items, follow-ups, and the menu catalog.

create policy catering_menu_items_select on public.catering_menu_items
  for select
  using (public.has_permission('catering.view') or public.has_permission('catering.manage'));

create policy catering_menu_items_write on public.catering_menu_items
  for all
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));

create policy catering_contacts_select on public.catering_contacts
  for select
  using (public.has_permission('catering.view') or public.has_permission('catering.manage'));

create policy catering_contacts_write on public.catering_contacts
  for all
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));

create policy catering_orders_select on public.catering_orders
  for select
  using (public.has_permission('catering.view') or public.has_permission('catering.manage'));

create policy catering_orders_write on public.catering_orders
  for all
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));

create policy catering_order_items_select on public.catering_order_items
  for select
  using (public.has_permission('catering.view') or public.has_permission('catering.manage'));

create policy catering_order_items_write on public.catering_order_items
  for all
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));

create policy catering_checklist_defaults_select on public.catering_checklist_defaults
  for select
  using (public.has_permission('catering.view') or public.has_permission('catering.manage'));

create policy catering_checklist_defaults_write on public.catering_checklist_defaults
  for all
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));

create policy catering_checklist_items_select on public.catering_checklist_items
  for select
  using (public.has_permission('catering.view') or public.has_permission('catering.manage'));

create policy catering_checklist_items_write on public.catering_checklist_items
  for all
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));

create policy catering_followups_select on public.catering_followups
  for select
  using (public.has_permission('catering.view') or public.has_permission('catering.manage'));

create policy catering_followups_write on public.catering_followups
  for all
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));
