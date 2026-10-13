-- Database backstop for the catering pipeline's stage rules (AGENTS.md
-- invariant 1: UI hiding is not security, and server actions are not the
-- only way in).
--
-- The catering_orders write policy (20260707040000_catering_rls.sql) only
-- checks catering.manage, which every shift leader holds. A leader could
-- therefore PATCH stage to any value straight through PostgREST with their
-- own session: skip Confirmation Call and FOH Setup, reopen a cancelled
-- order, or move an order back without catering.override. This trigger
-- allows exactly the moves the app's server actions make
-- (app/(app)/catering/actions.ts) and refuses everything else.
--
-- Allowed:
--   * No user session (auth.uid() is null, or the service_role JWT): the
--     catering cron (moves new/confirm to setup, and out to followup) and the
--     inbound email route (inserts new orders) use the service-role client,
--     the same trusted exemption profile_privilege_guard uses. A logged-out
--     (anon) write is not let through by this: the catering_orders RLS
--     policies call has_permission, which anon may not execute, so the write
--     still fails at RLS.
--   * Insert by a user: only into 'new' (createOrder).
--   * Update that leaves stage unchanged.
--   * Any leader (RLS already required catering.manage): one step forward
--     along the flow (changeStage), or any flow stage to cancelled
--     (cancelOrder, which also accepts a closed order).
--   * catering.override AND catering.manage: one step back along the flow
--     (moveOrderBack), and cancelled to a restore stage (restoreOrder).
--
-- The stage lists below must equal ORDER_STAGES, RESTORE_STAGES and
-- CANCELLED_STAGE in app/(app)/catering/logic.ts.
-- app/(app)/catering/stage-guard-migration.test.ts reads this file and fails
-- if they drift apart.
--
-- Not enforced here, on purpose: the checklist gates (the confirmation call
-- is done, the packing list is built and packed) stay in the app. Leaders can
-- already edit, tick and delete checklist items by design, so a database
-- check on them would add no real protection.
--
-- Deploy order: the app code already enforces all of these rules, so this
-- only adds the backstop. It is safe to apply at any time after
-- 20261013000000_catering_override_permission.sql (before that, no role holds
-- catering.override, so move back and restore are refused here too, which
-- matches the app hiding them).
--
-- SECURITY INVOKER: the only privileged call is has_permission, which
-- authenticated may execute. Postgres does not check EXECUTE on a trigger
-- function when the trigger fires, so it is revoked from every client role,
-- like the other trigger functions (20260926233807).
--
-- Idempotent: create or replace on the function, trigger dropped first.

create or replace function public.enforce_catering_stage_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  flow_stages constant text[] := array['new', 'confirm', 'setup', 'out', 'followup', 'closed'];
  restore_stages constant text[] := array['new', 'confirm', 'setup', 'out', 'followup'];
  cancelled_stage constant text := 'cancelled';
  from_index int;
  to_index int;
begin
  if auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.stage = 'new' then
      return new;
    end if;
    raise exception 'A new catering order must start in the new stage, not %.', new.stage
      using errcode = 'check_violation';
  end if;

  if new.stage = old.stage then
    return new;
  end if;

  from_index := array_position(flow_stages, old.stage);
  to_index := array_position(flow_stages, new.stage);

  if from_index is not null and to_index = from_index + 1 then
    return new;
  end if;

  if from_index is not null and new.stage = cancelled_stage then
    return new;
  end if;

  if public.has_permission('catering.override') and public.has_permission('catering.manage') then
    if from_index is not null and to_index = from_index - 1 then
      return new;
    end if;

    if old.stage = cancelled_stage and new.stage = any(restore_stages) then
      return new;
    end if;
  end if;

  raise exception 'A catering order cannot move from % to %.', old.stage, new.stage
    using errcode = 'check_violation',
          hint = 'Leaders move one stage forward or cancel. Moving back or restoring needs catering.override.';
end;
$$;

revoke all on function public.enforce_catering_stage_transition() from public, anon, authenticated;

drop trigger if exists catering_orders_stage_transition on public.catering_orders;

create trigger catering_orders_stage_transition
  before insert or update of stage on public.catering_orders
  for each row
  execute function public.enforce_catering_stage_transition();
