-- Foundation RLS backfill (orchestrator integration step).
--
-- Two gaps remained after merging the ten P1 module branches, both because a
-- table's owning code shipped but no RLS migration covered it:
--
--   1. app_events (P0-owned shared bus, lib/events/bus.ts): emitEvent() writes
--      it through the per-request AUTHENTICATED client, but the table only had
--      the P0 default-deny policy, so every emit silently failed. The
--      service-role cron/consumer path already bypasses RLS; this only needs
--      to open the producer (INSERT) and consumer (SELECT) paths for
--      authenticated users.
--
--   2. The Setups/Shifts/Breaks/Layout stream and the Tasks stream shipped
--      their pages and server actions but no *_rls.sql file, so these tables
--      were left reachable only by the default-deny policy: break_rules,
--      breaks, day_parts, layout_tiles, position_groups, setup_assignments,
--      setup_template_positions, setup_templates, setups, shift_notes,
--      store_layouts, stores, task_templates, tasks.
--
-- Every policy below mirrors the people/teams pattern
-- (20260707001850_people_teams_rls.sql) and the modules' own RLS files:
-- authenticated members can read what the module reads, writes are gated on
-- the exact has_permission(key) the module's server actions already call
-- (verified by grepping requirePermission('...') in app/(app)/{tasks,setups,
-- setups/templates,breaks}/actions.ts).
--
-- Idempotent: every policy/trigger is dropped-if-exists before (re)creation so
-- this migration is safe to re-apply. Permissive policies OR together with the
-- P0 default_deny (`using(false)`), so `false OR <condition>` = <condition>.

-- =====================================================================
-- app_events: producer + consumer paths for authenticated users.
-- Any signed-in user may emit an event (with check true); consumers read.
-- The service-role emit/cron path bypasses RLS entirely and is unaffected.
-- =====================================================================
drop policy if exists app_events_insert_authenticated on public.app_events;
create policy app_events_insert_authenticated on public.app_events
  for insert to authenticated
  with check (true);

drop policy if exists app_events_select_authenticated on public.app_events;
create policy app_events_select_authenticated on public.app_events
  for select to authenticated
  using (true);

-- =====================================================================
-- Tasks (keys: tasks.manage, tasks.complete)
-- =====================================================================
drop policy if exists tasks_select_authenticated on public.tasks;
create policy tasks_select_authenticated on public.tasks
  for select using (auth.uid() is not null);

drop policy if exists tasks_write_manager on public.tasks;
create policy tasks_write_manager on public.tasks
  for all
  using (public.has_permission('tasks.manage'))
  with check (public.has_permission('tasks.manage'));

-- Claiming / completing a task UPDATEs the row; gate on tasks.complete too.
drop policy if exists tasks_update_completer on public.tasks;
create policy tasks_update_completer on public.tasks
  for update
  using (public.has_permission('tasks.complete') or public.has_permission('tasks.manage'))
  with check (public.has_permission('tasks.complete') or public.has_permission('tasks.manage'));

drop policy if exists task_templates_select_authenticated on public.task_templates;
create policy task_templates_select_authenticated on public.task_templates
  for select using (auth.uid() is not null);

drop policy if exists task_templates_write_manager on public.task_templates;
create policy task_templates_write_manager on public.task_templates
  for all
  using (public.has_permission('tasks.manage'))
  with check (public.has_permission('tasks.manage'));

-- =====================================================================
-- Setups / shifts / layout (keys: setups.manage, setups.post, setups.view)
-- setups + setup_assignments + shift_notes are written by both manage and
-- post paths; templates/layout/groups are manage-only.
-- =====================================================================
drop policy if exists setups_select_authenticated on public.setups;
create policy setups_select_authenticated on public.setups
  for select using (auth.uid() is not null);

drop policy if exists setups_write on public.setups;
create policy setups_write on public.setups
  for all
  using (public.has_permission('setups.manage') or public.has_permission('setups.post'))
  with check (public.has_permission('setups.manage') or public.has_permission('setups.post'));

drop policy if exists setup_assignments_select_authenticated on public.setup_assignments;
create policy setup_assignments_select_authenticated on public.setup_assignments
  for select using (auth.uid() is not null);

drop policy if exists setup_assignments_write on public.setup_assignments;
create policy setup_assignments_write on public.setup_assignments
  for all
  using (public.has_permission('setups.manage') or public.has_permission('setups.post'))
  with check (public.has_permission('setups.manage') or public.has_permission('setups.post'));

drop policy if exists setup_templates_select_authenticated on public.setup_templates;
create policy setup_templates_select_authenticated on public.setup_templates
  for select using (auth.uid() is not null);

drop policy if exists setup_templates_write_manager on public.setup_templates;
create policy setup_templates_write_manager on public.setup_templates
  for all
  using (public.has_permission('setups.manage'))
  with check (public.has_permission('setups.manage'));

drop policy if exists setup_template_positions_select_authenticated on public.setup_template_positions;
create policy setup_template_positions_select_authenticated on public.setup_template_positions
  for select using (auth.uid() is not null);

drop policy if exists setup_template_positions_write_manager on public.setup_template_positions;
create policy setup_template_positions_write_manager on public.setup_template_positions
  for all
  using (public.has_permission('setups.manage'))
  with check (public.has_permission('setups.manage'));

drop policy if exists position_groups_select_authenticated on public.position_groups;
create policy position_groups_select_authenticated on public.position_groups
  for select using (auth.uid() is not null);

drop policy if exists position_groups_write_manager on public.position_groups;
create policy position_groups_write_manager on public.position_groups
  for all
  using (public.has_permission('setups.manage'))
  with check (public.has_permission('setups.manage'));

-- positions: written by setups/templates/actions.ts (setups.manage); only a
-- trigger (positions_create_passport) sits on it from training_rls, no policy.
drop policy if exists positions_select_authenticated on public.positions;
create policy positions_select_authenticated on public.positions
  for select using (auth.uid() is not null);

drop policy if exists positions_write_manager on public.positions;
create policy positions_write_manager on public.positions
  for all
  using (public.has_permission('setups.manage'))
  with check (public.has_permission('setups.manage'));

drop policy if exists store_layouts_select_authenticated on public.store_layouts;
create policy store_layouts_select_authenticated on public.store_layouts
  for select using (auth.uid() is not null);

drop policy if exists store_layouts_write_manager on public.store_layouts;
create policy store_layouts_write_manager on public.store_layouts
  for all
  using (public.has_permission('setups.manage'))
  with check (public.has_permission('setups.manage'));

drop policy if exists layout_tiles_select_authenticated on public.layout_tiles;
create policy layout_tiles_select_authenticated on public.layout_tiles
  for select using (auth.uid() is not null);

drop policy if exists layout_tiles_write_manager on public.layout_tiles;
create policy layout_tiles_write_manager on public.layout_tiles
  for all
  using (public.has_permission('setups.manage'))
  with check (public.has_permission('setups.manage'));

-- shift_notes: posted during a setup post; readable by any member.
drop policy if exists shift_notes_select_authenticated on public.shift_notes;
create policy shift_notes_select_authenticated on public.shift_notes
  for select using (auth.uid() is not null);

drop policy if exists shift_notes_write on public.shift_notes;
create policy shift_notes_write on public.shift_notes
  for all
  using (public.has_permission('setups.post') or public.has_permission('setups.manage'))
  with check (public.has_permission('setups.post') or public.has_permission('setups.manage'));

-- day_parts: seeded config read across most modules; never written by app
-- code, so writes are gated on settings.manage as a defensive admin path.
drop policy if exists day_parts_select_authenticated on public.day_parts;
create policy day_parts_select_authenticated on public.day_parts
  for select using (auth.uid() is not null);

drop policy if exists day_parts_write_admin on public.day_parts;
create policy day_parts_write_admin on public.day_parts
  for all
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

-- =====================================================================
-- Breaks (keys: breaks.manage) — break_rules + breaks written by the break
-- engine (app/(app)/breaks/actions.ts), all gated on breaks.manage.
-- =====================================================================
drop policy if exists break_rules_select_authenticated on public.break_rules;
create policy break_rules_select_authenticated on public.break_rules
  for select using (auth.uid() is not null);

drop policy if exists break_rules_write_manager on public.break_rules;
create policy break_rules_write_manager on public.break_rules
  for all
  using (public.has_permission('breaks.manage'))
  with check (public.has_permission('breaks.manage'));

drop policy if exists breaks_select_authenticated on public.breaks;
create policy breaks_select_authenticated on public.breaks
  for select using (auth.uid() is not null);

drop policy if exists breaks_write_manager on public.breaks;
create policy breaks_write_manager on public.breaks
  for all
  using (public.has_permission('breaks.manage'))
  with check (public.has_permission('breaks.manage'));

-- =====================================================================
-- stores: the store record, read by any member of the store (joins from the
-- app shell); only settings.manage can edit it.
-- =====================================================================
drop policy if exists stores_select_member on public.stores;
create policy stores_select_member on public.stores
  for select using (auth.uid() is not null);

drop policy if exists stores_write_admin on public.stores;
create policy stores_write_admin on public.stores
  for all
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
