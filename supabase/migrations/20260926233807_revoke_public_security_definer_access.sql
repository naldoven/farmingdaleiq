-- Privileged database objects must not inherit Supabase's broad public-schema
-- defaults. The existing security-definer helpers validate callers internally,
-- but the anon role could still invoke every helper and select the
-- security-definer accountability view. Keep only the authenticated RPCs the
-- app uses, and leave trigger helpers callable only by their triggers.

-- What the next statement does: it removes Supabase's per-schema default
-- grants, so a function that postgres creates in public from now on no longer
-- gets an explicit EXECUTE grant for anon and authenticated. Service-role
-- access stays available for trusted server-side jobs.
--
-- What it does NOT do: Postgres also grants EXECUTE on every new function to
-- PUBLIC, and anon is a member of PUBLIC. That built-in default is global, so
-- a schema-scoped REVOKE cannot undo it. A new function stays callable by
-- logged-out clients until its own migration runs
-- `revoke all on function ... from public, anon, authenticated` and then
-- grants execute to authenticated explicitly. This applies to every new
-- SECURITY DEFINER function. lib/supabase/security-definer-access.test.ts
-- replays all migrations and fails when a definer function is missing that
-- revoke.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Direct RPCs used through an authenticated per-request Supabase client.
--
-- has_permission and current_store_id are also called by many RLS policies.
-- With anon no longer able to execute them, a raw logged-out request (straight
-- to the REST API, no session) against a table whose policy calls either one
-- now fails with "permission denied for function" instead of returning zero
-- rows. That is intentional. No app path reads tables as anon: pages and
-- actions use a signed-in per-request client, and the public maintenance
-- portal writes through a server-side route handler.
revoke all on function public.adjust_tokens(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.adjust_tokens(uuid, integer, text) to authenticated;

revoke all on function public.cancel_reward_claim(uuid) from public, anon, authenticated;
grant execute on function public.cancel_reward_claim(uuid) to authenticated;

revoke all on function public.current_store_id() from public, anon, authenticated;
grant execute on function public.current_store_id() to authenticated;

revoke all on function public.delete_position(uuid) from public, anon, authenticated;
grant execute on function public.delete_position(uuid) to authenticated;

revoke all on function public.delete_position_group(uuid) from public, anon, authenticated;
grant execute on function public.delete_position_group(uuid) to authenticated;

revoke all on function public.gift_tokens(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.gift_tokens(uuid, integer, text, uuid) to authenticated;

revoke all on function public.graduate_trainee(uuid) from public, anon, authenticated;
grant execute on function public.graduate_trainee(uuid) to authenticated;

revoke all on function public.has_permission(text) from public, anon, authenticated;
grant execute on function public.has_permission(text) to authenticated;

revoke all on function public.redeem_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;

revoke all on function public.setup_has_top_performer(uuid) from public, anon, authenticated;
grant execute on function public.setup_has_top_performer(uuid) to authenticated;

-- Trigger functions are never called through the Data API.
revoke all on function public.create_position_passport() from public, anon, authenticated;
revoke all on function public.enforce_profile_private_guard() from public, anon, authenticated;
revoke all on function public.enforce_profile_privilege_guard() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- public.is_active_profile() is the 15th SECURITY DEFINER function. It is
-- deliberately left alone: it stays callable by anon (granted in
-- 20260801000000_waste_hardening.sql) because the waste select policies are
-- also evaluated for anon, and it returns false when logged out, so it
-- exposes no data. The regression test lists it as a named allowlist entry.

-- This view deliberately bypasses base-table RLS so a team member can read
-- only their own infraction record without exposing issued_by. Its auth.uid()
-- predicate remains the row boundary; anonymous clients must not select it.
revoke all on table public.my_infractions from public, anon, authenticated;
grant select on table public.my_infractions to authenticated;
