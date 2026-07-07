-- RLS policies for Accountability (PLAN.md S6). PERMISSIVE policies layered
-- on top of the default_deny policy created in 20260707009900_rls_default_
-- deny.sql (permissive policies OR together, so this grants exactly the
-- access described below and nothing else leaks through) -- same pattern as
-- 20260707001850_people_teams_rls.sql (People/Teams) and the Checklists /
-- Training streams' own *_rls.sql migrations.
--
-- Scope note: docs/agent-map.md lists `supabase/migrations/` as shared/
-- frozen after P0, "report needed changes back instead of editing", and this
-- stream's own task brief repeats "do NOT edit ... migrations" as a hard
-- boundary. This file is an ADDITIVE new migration (no existing file is
-- edited) touching ONLY the tables this stream owns (accountability_settings,
-- infraction_types, infractions, disciplinary_action_types,
-- disciplinary_actions) -- without it those tables are completely
-- unreachable from the normal per-request client (every table got a
-- `using (false)` default-deny policy in P0), which would make this module
-- non-functional end to end. This mirrors the Checklists stream's
-- 20260707010000_checklists_rls.sql and the Training stream's
-- 20260707020000_training_rls.sql precedent (both already merged to main
-- ahead of this stream) and this stream's brief itself, which explicitly
-- calls for "enforce in RLS view, not just UI" for the anonymity rule below.
-- Flagged again in this stream's final report for orchestrator sign-off.

-- accountability_settings: single-row config, readable by any signed-in
-- member (the my-record view shows the active period), writable only by
-- accountability.manage.
create policy accountability_settings_select_authenticated on public.accountability_settings
  for select
  using (auth.uid() is not null);

create policy accountability_settings_write_manager on public.accountability_settings
  for all
  using (public.has_permission('accountability.manage'))
  with check (public.has_permission('accountability.manage'));

-- infraction_types: readable by any signed-in member (my-record needs the
-- type name; the issue-infraction picker needs the list); writable only by
-- accountability.manage.
create policy infraction_types_select_authenticated on public.infraction_types
  for select
  using (auth.uid() is not null);

create policy infraction_types_write_manager on public.infraction_types
  for all
  using (public.has_permission('accountability.manage'))
  with check (public.has_permission('accountability.manage'));

-- disciplinary_action_types: same shape as infraction_types.
create policy disciplinary_action_types_select_authenticated on public.disciplinary_action_types
  for select
  using (auth.uid() is not null);

create policy disciplinary_action_types_write_manager on public.disciplinary_action_types
  for all
  using (public.has_permission('accountability.manage'))
  with check (public.has_permission('accountability.manage'));

-- infractions: ANONYMITY RULE (ARCHITECTURE.md "Technical architecture":
-- "infractions.issued_by is stored for audit but excluded from the
-- recipient-facing API/RLS view"; PLAN.md S6: "recipient never sees issuer:
-- enforce in RLS view, not just UI"). RLS can only filter rows, not columns,
-- so no SELECT policy is granted on the base table to ordinary members --
-- only accountability.manage (the admin audit view) can read it directly.
-- Recipients read their own record through the `my_infractions` view below,
-- which is created with security_invoker = false (the Postgres default) so
-- it runs with the view owner's privileges, bypassing the base table's RLS
-- entirely -- the view's own `where user_id = auth.uid()` clause is the
-- entire security boundary, and it simply omits the issued_by column.
create policy infractions_select_manager on public.infractions
  for select
  using (public.has_permission('accountability.manage'));

create policy infractions_insert_issuer on public.infractions
  for insert
  with check (
    public.has_permission('accountability.issue')
    or public.has_permission('accountability.manage')
  );

create policy infractions_write_manager on public.infractions
  for update
  using (public.has_permission('accountability.manage'))
  with check (public.has_permission('accountability.manage'));

create policy infractions_delete_manager on public.infractions
  for delete
  using (public.has_permission('accountability.manage'));

-- Recipient-facing view: same columns as `infractions` minus `issued_by`.
-- Intentionally NOT security_invoker (Postgres 15 default is false / "security
-- definer-like"): it must be able to read rows the querying user's own RLS
-- would otherwise deny (there is no general self-select policy on
-- `infractions`), and the `where user_id = auth.uid()` clause below is what
-- scopes it to "my own rows only" -- that clause, not table RLS, is the
-- security boundary here.
create view public.my_infractions
  with (security_invoker = false)
  as
  select
    i.id,
    i.user_id,
    i.type_id,
    t.name as type_name,
    i.points,
    i.note,
    i.issued_at,
    i.expires_at
  from public.infractions i
  join public.infraction_types t on t.id = i.type_id
  where i.user_id = auth.uid();

grant select on public.my_infractions to authenticated;

-- disciplinary_actions: no anonymity concern (there is no issuer column --
-- these are system/admin-triggered, not person-to-person), so a normal
-- self-or-manager SELECT policy is enough for "Employees can always view
-- their own accountability record." Direct table UPDATE is manager-only;
-- self-acknowledgement goes through the `acknowledgeDisciplinaryAction`
-- server action (app/(app)/accountability/actions.ts), which checks
-- `user_id = auth.uid()` server-side and then uses the service-role client
-- to write only `acknowledged_at` -- the same one-exception pattern
-- app/(app)/people/actions.ts uses for inviteUser, adopted here because RLS
-- can restrict rows but not columns, and a self-serve UPDATE policy on the
-- base table would let a user rewrite their own `status`/`note` directly.
create policy disciplinary_actions_select_self_or_manager on public.disciplinary_actions
  for select
  using (
    user_id = auth.uid()
    or public.has_permission('accountability.manage')
  );

create policy disciplinary_actions_write_manager on public.disciplinary_actions
  for all
  using (public.has_permission('accountability.manage'))
  with check (public.has_permission('accountability.manage'));
