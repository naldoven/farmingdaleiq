-- RLS policies for Notifications & Discord (S10 stream).
--
-- New migration file, not an edit to an existing one — docs/agent-map.md
-- lists supabase/migrations/ as frozen after P0, but the P0 migration that
-- created these five tables (20260707001600_notifications_discord.sql) left
-- an explicit breadcrumb assigning this exact work to S10:
--
--   "-- webhook_url is server-side only: no RLS SELECT policy exposes it to
--    the browser (P1 S10 owns the RLS policies for this table)."
--
-- Without this file, the default-deny catch-all
-- (20260707009900_rls_default_deny.sql) blocks every read and write on all
-- five tables and the module cannot function at all. This adds ONLY
-- permissive policies scoped to the tables docs/agent-map.md lists under
-- S10 (notifications, push_subscriptions, discord_channels,
-- discord_event_routes, discord_outbox) — no other table is touched, and no
-- existing migration file is edited. See PLAN.md/docs/agent-map.md's own
-- People/Teams precedent (20260707001850_people_teams_rls.sql), which is
-- also a dedicated RLS-only migration layered on top of an earlier
-- table-creation migration.

-- notifications: personal, not permission-gated — a user can see and mark
-- read only their own notifications. No INSERT/DELETE policy: rows are only
-- ever created by lib/notify (service-role client, which bypasses RLS
-- entirely; see lib/notify/events.ts).
create policy notifications_select_own on public.notifications
  for select
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- push_subscriptions: a user manages only their own subscriptions
-- (register on opt-in, remove on opt-out). Also self-service, no
-- permission key involved.
create policy push_subscriptions_select_own on public.push_subscriptions
  for select
  using (user_id = auth.uid());

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert
  with check (user_id = auth.uid());

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete
  using (user_id = auth.uid());

-- discord_channels: DELIBERATELY NO POLICY for the authenticated role, on
-- any operation. webhook_url must never be reachable from the browser, not
-- even by an admin's own JWT hitting the PostgREST API directly (see the
-- P0 breadcrumb quoted above and ARCHITECTURE.md "Discord integration" >
-- Transport: "stored server-side only and never sent to the browser"). All
-- reads/writes go through app/(app)/settings/discord/actions.ts and
-- lib/discord/routes.ts using createServiceRoleClient(), gated by
-- requirePermission("discord.manage") in application code — the one
-- documented exception to "RLS is the real backstop" in this stream,
-- mirroring the single service-role exception in
-- app/(app)/people/actions.ts (`inviteUser`).

-- discord_event_routes: no secrets here (just event_key -> channel_id,
-- enabled), so this one keeps the normal pattern — readable by any
-- discord.manage holder, writable only by them.
create policy discord_event_routes_select_manager on public.discord_event_routes
  for select
  using (public.has_permission('discord.manage'));

create policy discord_event_routes_write_manager on public.discord_event_routes
  for all
  using (public.has_permission('discord.manage'))
  with check (public.has_permission('discord.manage'));

-- discord_outbox: observability only for admins; all writes go through the
-- service-role client (lib/discord/outbox.ts), same reasoning as
-- discord_channels — the payload can carry a channel_id an admin isn't
-- supposed to correlate to a webhook_url they can't otherwise see, but the
-- outbox message content itself (task titles, recognitions, etc.) is not a
-- secret, so a read policy for discord.manage is fine.
create policy discord_outbox_select_manager on public.discord_outbox
  for select
  using (public.has_permission('discord.manage'));
