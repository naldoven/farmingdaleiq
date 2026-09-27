-- Privileged database objects must not inherit Supabase's broad public-schema
-- defaults. The existing security-definer helpers validate callers internally,
-- but the anon role could still invoke every helper and select the
-- security-definer accountability view. Keep only the authenticated RPCs the
-- app uses, and leave trigger helpers callable only by their triggers.

-- New public functions require an explicit grant in the migration that creates
-- them. Service-role access remains available for trusted server-side jobs.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Direct RPCs used through an authenticated per-request Supabase client.
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

-- This view deliberately bypasses base-table RLS so a team member can read
-- only their own infraction record without exposing issued_by. Its auth.uid()
-- predicate remains the row boundary; anonymous clients must not select it.
revoke all on table public.my_infractions from public, anon, authenticated;
grant select on table public.my_infractions to authenticated;
