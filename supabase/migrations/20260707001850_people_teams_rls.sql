-- RLS policies for People & Teams (PLAN.md P0 #6). These are core/foundation
-- tables owned by P0 (docs/agent-map.md), not by any P1 stream.
--
-- These are PERMISSIVE policies layered on top of the default_deny policy
-- created in 20260707009900_rls_default_deny.sql (permissive policies OR
-- together, so this grants exactly the access described below and nothing
-- else leaks through).

-- profiles: any signed-in, active member of the store can view the roster;
-- a manager (people.manage) can edit anyone in the store; a user can always
-- edit their own contact info.
create policy profiles_select_store_member on public.profiles
  for select
  using (public.current_store_id() is not null and store_id = public.current_store_id());

create policy profiles_update_manager on public.profiles
  for update
  using (public.has_permission('people.manage') and store_id = public.current_store_id())
  with check (public.has_permission('people.manage') and store_id = public.current_store_id());

create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- roles / role_permissions: readable by any signed-in store member (role
-- dropdowns, permission-gated UI); only roles.manage can write.
create policy roles_select_authenticated on public.roles
  for select
  using (public.current_store_id() is not null);

create policy roles_write_manager on public.roles
  for all
  using (public.has_permission('roles.manage'))
  with check (public.has_permission('roles.manage'));

create policy role_permissions_select_authenticated on public.role_permissions
  for select
  using (public.current_store_id() is not null);

create policy role_permissions_write_manager on public.role_permissions
  for all
  using (public.has_permission('roles.manage'))
  with check (public.has_permission('roles.manage'));

-- teams / team_members: readable by any signed-in store member; teams.manage
-- required to create/rename teams or change membership.
create policy teams_select_authenticated on public.teams
  for select
  using (public.current_store_id() is not null);

create policy teams_write_manager on public.teams
  for all
  using (public.has_permission('teams.manage'))
  with check (public.has_permission('teams.manage'));

create policy team_members_select_authenticated on public.team_members
  for select
  using (public.current_store_id() is not null);

create policy team_members_write_manager on public.team_members
  for all
  using (public.has_permission('teams.manage'))
  with check (public.has_permission('teams.manage'));
