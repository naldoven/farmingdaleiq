-- RLS policies for Checklists (PLAN.md S1). These are PERMISSIVE policies
-- layered on top of the default_deny policy created in
-- 20260707009900_rls_default_deny.sql (permissive policies OR together, so
-- this grants exactly the access described below and nothing else leaks
-- through) -- same pattern as 20260707001850_people_teams_rls.sql for
-- People & Teams.
--
-- Scope note: docs/agent-map.md lists `supabase/migrations/` as shared/frozen
-- after P0, "report needed changes back instead of editing". This file is an
-- ADDITIVE new migration (no existing file is edited) touching ONLY the
-- tables this stream owns (food_items, checklist_*, follow_ups) -- without
-- it those tables are unreachable from the normal per-request client (every
-- table got a `using (false)` default-deny policy in P0), which would make
-- the whole module non-functional end to end. This mirrors the S6
-- Accountability brief's explicit expectation of its own privacy-rule RLS
-- view and P0's own precedent of a dedicated *_rls.sql file per feature
-- area. Flagged in this stream's final report for orchestrator sign-off
-- given the "do not touch migrations" instruction is otherwise blanket.
--
-- checklists.complete is granted to every seeded role (base_keys in
-- 20260707001900_seed_store_config.sql cascades into every tier above it),
-- so gating writes on it is the practical equivalent of "any active,
-- signed-in team member" today, while still failing closed for a
-- hypothetical future role that lacks it.

-- food_items: template builders need to create/edit them; everyone who can
-- run a checklist needs to read them (temperature question range display).
create policy food_items_select_authenticated on public.food_items
  for select
  using (auth.uid() is not null);

create policy food_items_write_manager on public.food_items
  for all
  using (public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.manage_templates'));

-- checklist_templates / checklist_sections / checklist_questions /
-- checklist_schedules: readable by any signed-in member (run player needs to
-- read the structure it's completing); writable only by template managers.
create policy checklist_templates_select_authenticated on public.checklist_templates
  for select
  using (auth.uid() is not null);

create policy checklist_templates_write_manager on public.checklist_templates
  for all
  using (public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.manage_templates'));

create policy checklist_sections_select_authenticated on public.checklist_sections
  for select
  using (auth.uid() is not null);

create policy checklist_sections_write_manager on public.checklist_sections
  for all
  using (public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.manage_templates'));

create policy checklist_questions_select_authenticated on public.checklist_questions
  for select
  using (auth.uid() is not null);

create policy checklist_questions_write_manager on public.checklist_questions
  for all
  using (public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.manage_templates'));

create policy checklist_schedules_select_authenticated on public.checklist_schedules
  for select
  using (auth.uid() is not null);

create policy checklist_schedules_write_manager on public.checklist_schedules
  for all
  using (public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.manage_templates'));

-- checklist_runs: readable by any signed-in member (today's list + the run
-- player); updatable (start/complete) by anyone who can complete checklists
-- or manage templates. Inserts (materialization) go through the service-role
-- client in app/api/cron/checklists/route.ts, which bypasses RLS entirely,
-- so no insert policy is granted to normal users here.
create policy checklist_runs_select_authenticated on public.checklist_runs
  for select
  using (auth.uid() is not null);

create policy checklist_runs_update_completer on public.checklist_runs
  for update
  using (public.has_permission('checklists.complete') or public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.complete') or public.has_permission('checklists.manage_templates'));

-- checklist_answers: same shape as checklist_runs -- readable by any
-- signed-in member, writable by anyone who can complete checklists.
create policy checklist_answers_select_authenticated on public.checklist_answers
  for select
  using (auth.uid() is not null);

create policy checklist_answers_write_completer on public.checklist_answers
  for all
  using (public.has_permission('checklists.complete') or public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.complete') or public.has_permission('checklists.manage_templates'));

-- follow_ups: readable by any signed-in member; created/resolved by anyone
-- who can complete checklists (completeRun creates them; resolveFollowUp
-- resolves them) or manage templates.
create policy follow_ups_select_authenticated on public.follow_ups
  for select
  using (auth.uid() is not null);

create policy follow_ups_write_completer on public.follow_ups
  for all
  using (public.has_permission('checklists.complete') or public.has_permission('checklists.manage_templates'))
  with check (public.has_permission('checklists.complete') or public.has_permission('checklists.manage_templates'));
