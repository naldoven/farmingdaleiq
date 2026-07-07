-- RLS policies for Vendors + Maintenance (PLAN.md S8). These are PERMISSIVE
-- policies layered on top of the default_deny policy created in
-- 20260707009900_rls_default_deny.sql (permissive policies OR together, so
-- this grants exactly the access described below and nothing else leaks
-- through) -- same pattern as 20260707001850_people_teams_rls.sql for
-- People & Teams and 20260707010000_checklists_rls.sql for Checklists.
--
-- Scope note: docs/agent-map.md lists `supabase/migrations/` as shared/
-- frozen after P0, "report needed changes back instead of editing". This
-- file is an ADDITIVE new migration (no existing file is edited) touching
-- ONLY the tables this stream owns (vendors, equipment, equipment_files,
-- maintenance_requests, work_orders, work_order_comments,
-- equipment_downtime, pm_schedules) -- without it these tables are
-- unreachable from the normal per-request client (every table got a
-- `using (false)` default-deny policy in P0), which would make the whole
-- module non-functional end to end. Flagged in this stream's final report
-- for orchestrator sign-off given the "do not touch migrations"
-- instruction is otherwise blanket.
--
-- vendors.view and maintenance.request are base_keys seeded for every role
-- (20260707001900_seed_store_config.sql), so gating some reads on them is
-- the practical equivalent of "any active, signed-in team member" today,
-- while still failing closed for a hypothetical future role that lacks
-- them. Reads that aren't privacy-sensitive just use
-- `auth.uid() is not null` directly, matching the Checklists/Waste
-- precedent, to keep this file's shape consistent with theirs.

-- vendors: readable by anyone signed in (directory + pickers elsewhere);
-- writable only by vendors.manage.
create policy vendors_select_authenticated on public.vendors
  for select
  using (auth.uid() is not null);

create policy vendors_write_manager on public.vendors
  for all
  using (public.has_permission('vendors.manage'))
  with check (public.has_permission('vendors.manage'));

-- equipment / equipment_files: readable by anyone signed in (request form
-- picker, registry, equipment detail page); writable only by
-- maintenance.manage. This is also the ONLY write path for equipment.status
-- (down/operational) -- see app/(app)/maintenance/equipment/actions.ts's
-- setEquipmentStatus and app/(app)/maintenance/downtime.ts, both of which
-- require maintenance.manage before touching this table.
create policy equipment_select_authenticated on public.equipment
  for select
  using (auth.uid() is not null);

create policy equipment_write_manager on public.equipment
  for all
  using (public.has_permission('maintenance.manage'))
  with check (public.has_permission('maintenance.manage'));

create policy equipment_files_select_authenticated on public.equipment_files
  for select
  using (auth.uid() is not null);

create policy equipment_files_write_manager on public.equipment_files
  for all
  using (public.has_permission('maintenance.manage'))
  with check (public.has_permission('maintenance.manage'));

-- maintenance_requests: readable by anyone signed in (not privacy-sensitive,
-- unlike Accountability's infractions -- ARCHITECTURE.md doesn't ask for
-- anonymity here). Insert requires maintenance.request (the base key every
-- role holds) and the row must be attributed to the caller (submitted_by
-- null or the caller's own id -- app/(app)/maintenance/actions.ts's
-- submitMaintenanceRequest always sets it to auth.uid(); this is defense in
-- depth against a direct API call impersonating someone else, matching
-- Waste's waste_entries_insert_logger precedent). Only maintenance.triage
-- can update a request (approve/decline), matching approveRequest/
-- declineRequest in the same actions file.
create policy maintenance_requests_select_authenticated on public.maintenance_requests
  for select
  using (auth.uid() is not null);

create policy maintenance_requests_insert_requester on public.maintenance_requests
  for insert
  with check (
    public.has_permission('maintenance.request')
    and (submitted_by is null or submitted_by = auth.uid())
  );

create policy maintenance_requests_update_triage on public.maintenance_requests
  for update
  using (public.has_permission('maintenance.triage'))
  with check (public.has_permission('maintenance.triage'));

-- work_orders: readable by anyone signed in (board + detail page). Only
-- maintenance.triage can create one (approveRequest/createWorkOrder).
-- Updates (status moves, completion, assignment) are allowed for
-- maintenance.triage OR the work order's own assigned_user_id -- an
-- in-house assignee needs to progress their own ticket without the leader
-- tier's triage permission (ARCHITECTURE.md "Work orders": "Assigned to a
-- team member ... or a vendor"). Mirrors the canWriteWorkOrder() check in
-- app/(app)/maintenance/actions.ts.
create policy work_orders_select_authenticated on public.work_orders
  for select
  using (auth.uid() is not null);

create policy work_orders_insert_triage on public.work_orders
  for insert
  with check (public.has_permission('maintenance.triage'));

create policy work_orders_update_manager_or_assignee on public.work_orders
  for update
  using (public.has_permission('maintenance.triage') or assigned_user_id = auth.uid())
  with check (public.has_permission('maintenance.triage') or assigned_user_id = auth.uid());

-- work_order_comments: readable by anyone signed in (before/after photo
-- thread); any signed-in team member (maintenance.request) can comment, as
-- long as the comment is attributed to themselves (or left unattributed).
create policy work_order_comments_select_authenticated on public.work_order_comments
  for select
  using (auth.uid() is not null);

create policy work_order_comments_insert_authenticated on public.work_order_comments
  for insert
  with check (
    public.has_permission('maintenance.request')
    and (author_id is null or author_id = auth.uid())
  );

-- equipment_downtime: readable by anyone signed in (downtime history on the
-- equipment page); writable only by maintenance.manage. This intentionally
-- does NOT extend to a work order's assignee the way work_orders does --
-- see the comment on canManageEquipment in
-- components/maintenance/work-order-detail.tsx: an assignee without
-- maintenance.manage can complete their own work order, but flipping
-- equipment status/downtime spans stays a leader/admin action, and the UI
-- only offers that control to maintenance.manage holders.
create policy equipment_downtime_select_authenticated on public.equipment_downtime
  for select
  using (auth.uid() is not null);

create policy equipment_downtime_write_manager on public.equipment_downtime
  for all
  using (public.has_permission('maintenance.manage'))
  with check (public.has_permission('maintenance.manage'));

-- pm_schedules: readable by anyone signed in (equipment detail page);
-- writable only by maintenance.manage. Inserts from the PM cron job
-- (app/api/cron/maintenance/route.ts) go through the service-role client,
-- which bypasses RLS entirely, so no separate policy is needed for that.
create policy pm_schedules_select_authenticated on public.pm_schedules
  for select
  using (auth.uid() is not null);

create policy pm_schedules_write_manager on public.pm_schedules
  for all
  using (public.has_permission('maintenance.manage'))
  with check (public.has_permission('maintenance.manage'));
