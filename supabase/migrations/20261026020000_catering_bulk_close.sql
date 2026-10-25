-- Bulk close for stale catering orders.
--
-- On 2026-10-25, 172 past-event orders were still sitting in New because
-- nobody worked the pipeline, and they had to be closed by hand in the
-- database. The stage guard (20261013010000_catering_stage_transition_guard.sql)
-- only lets a leader move one step forward, so clearing a month of stale
-- orders through the app meant five moves per order, each blocked by a
-- checklist gate for work nobody did. This migration adds:
--
--   1. One extra rule in the stage guard, for managers only (catering.override
--      AND catering.manage): an order whose event date is already past may go
--      from any active flow stage straight to closed. Plain leaders keep the
--      one-step rule. Future and same-day orders keep it for everyone, so the
--      shortcut can never be used to skip work that still matters.
--
--   2. catering_bulk_close(p_order_ids, p_reason): closes a batch of past-event
--      orders in one transaction, writes one catering_stage_change row to
--      app_events per closed order (reason, override = bulk_close,
--      emitted_by = the manager, notify_discord = false so the Discord consumer
--      in lib/notify/events.ts never posts it), queues no re-book follow-up,
--      and reports an outcome per id. It is SECURITY INVOKER, so the update
--      still goes through the catering_orders RLS policy (catering.manage) and
--      through the stage guard above; the function is a convenience and an
--      audit trail, not a bypass.
--
-- Deploy order: apply AFTER 20261025000000_catering_atomic_setup_and_guards.sql
-- if that migration is in use. Both files recreate
-- enforce_catering_stage_transition; this one carries that file's friendly
-- stage labels, so applying this one last leaves both changes in place.
-- Applying it before the code deploys is safe: nothing calls the function yet,
-- and the new trigger rule only widens what override holders may do.
--
-- Store day: Postgres has no access to the stores table's timezone from a
-- SECURITY INVOKER trigger without an extra read per row, so the store zone is
-- the same constant the app uses (lib/time.ts STORE_TIME_ZONE,
-- America/New_York). "Past" means event_date < today's store date.
--
-- The stage lists and the label map below must equal ORDER_STAGES,
-- RESTORE_STAGES, CANCELLED_STAGE and ORDER_STAGE_LABELS in
-- app/(app)/catering/logic.ts. app/(app)/catering/bulk-close-migration.test.ts
-- reads this file and fails if they drift apart.
--
-- Idempotent: create or replace on both functions, trigger dropped first,
-- grants re-run safely.


-- ---------------------------------------------------------------------------
-- 1. Stage guard: managers may close a past-event order in one move
-- ---------------------------------------------------------------------------

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
  closed_stage constant text := 'closed';
  store_time_zone constant text := 'America/New_York';
  stage_labels constant jsonb := '{
    "new": "New",
    "confirm": "Confirmation Call",
    "setup": "FOH Setup",
    "out": "Pickup/Delivery",
    "followup": "Follow-up",
    "closed": "Closed",
    "cancelled": "Cancelled"
  }';
  from_index int;
  to_index int;
  is_manager boolean;
begin
  if auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.stage = 'new' then
      return new;
    end if;
    raise exception 'A new catering order must start in %, not %.',
      stage_labels ->> 'new',
      coalesce(stage_labels ->> new.stage, new.stage)
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

  is_manager := public.has_permission('catering.override') and public.has_permission('catering.manage');

  if is_manager then
    if from_index is not null and to_index = from_index - 1 then
      return new;
    end if;

    if old.stage = cancelled_stage and new.stage = any(restore_stages) then
      return new;
    end if;

    -- Bulk close of stale orders: the event already happened, so the
    -- confirmation call and the packing list no longer matter. The date
    -- compared is the one stored before this update, so a single PATCH
    -- cannot move the date into the past and close in the same step.
    if from_index is not null
       and old.stage <> closed_stage
       and new.stage = closed_stage
       and old.event_date < (now() at time zone store_time_zone)::date then
      return new;
    end if;
  end if;

  raise exception 'A catering order cannot move from % to %.',
    coalesce(stage_labels ->> old.stage, old.stage),
    coalesce(stage_labels ->> new.stage, new.stage)
    using errcode = 'check_violation',
          hint = 'Leaders move one stage forward or cancel. Moving back, restoring, or closing a past-event order in one step needs catering.override.';
end;
$$;

revoke all on function public.enforce_catering_stage_transition() from public, anon, authenticated;

drop trigger if exists catering_orders_stage_transition on public.catering_orders;

create trigger catering_orders_stage_transition
  before insert or update of stage on public.catering_orders
  for each row
  execute function public.enforce_catering_stage_transition();


-- ---------------------------------------------------------------------------
-- 2. catering_bulk_close: close a batch of past-event orders with one reason
-- ---------------------------------------------------------------------------
-- Outcomes per id: 'closed', 'already_closed' (a second run of the same batch
-- is a no-op for that order), 'cancelled' (cancelled orders stay cancelled;
-- Restore is the manager path for those), 'not_past' (event today or later,
-- refused on purpose), 'not_found' (missing, or hidden by RLS).
--
-- Each order row is locked (select ... for update) before it is read, so a
-- leader's move or a second bulk close running at the same time waits and
-- then sees the final stage instead of racing it. Everything runs in the
-- caller's single transaction: either every closable order in the batch
-- closes and is logged, or none is.

create or replace function public.catering_bulk_close(p_order_ids uuid[], p_reason text)
returns table(order_id uuid, outcome text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  store_time_zone constant text := 'America/New_York';
  stage_labels constant jsonb := '{
    "new": "New",
    "confirm": "Confirmation Call",
    "setup": "FOH Setup",
    "out": "Pickup/Delivery",
    "followup": "Follow-up",
    "closed": "Closed",
    "cancelled": "Cancelled"
  }';
  v_reason text := btrim(coalesce(p_reason, ''));
  v_today date := (now() at time zone store_time_zone)::date;
  v_ids uuid[];
  v_id uuid;
  v_order public.catering_orders%rowtype;
begin
  if not (public.has_permission('catering.override') and public.has_permission('catering.manage')) then
    raise exception 'Closing stale orders needs catering.override and catering.manage.'
      using errcode = 'insufficient_privilege';
  end if;

  if length(v_reason) < 3 or length(v_reason) > 300 then
    raise exception 'Add a short reason (3 to 300 characters).'
      using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
    into v_ids
  from unnest(coalesce(p_order_ids, '{}'::uuid[])) as u(id);

  if cardinality(v_ids) > 200 then
    raise exception 'Close at most 200 orders at a time.'
      using errcode = 'check_violation';
  end if;

  foreach v_id in array v_ids loop
    order_id := v_id;

    select *
      into v_order
    from public.catering_orders o
    where o.id = v_id
    for update;

    if not found then
      outcome := 'not_found';
      return next;
      continue;
    end if;

    if v_order.stage = 'closed' then
      outcome := 'already_closed';
      return next;
      continue;
    end if;

    if v_order.stage = 'cancelled' then
      outcome := 'cancelled';
      return next;
      continue;
    end if;

    if v_order.event_date >= v_today then
      outcome := 'not_past';
      return next;
      continue;
    end if;

    update public.catering_orders o
    set stage = 'closed',
        stage_changed_at = now()
    where o.id = v_id;

    -- Same event key and shape as moveOrderBack / restoreOrder in
    -- app/(app)/catering/actions.ts, so the audit trail reads the same way.
    -- notify_discord false: a bulk close of a month of stale orders must not
    -- flood the catering channel. No follow-up row: a re-book call for an
    -- event nobody worked would be noise.
    insert into public.app_events (event_key, payload)
    values (
      'catering_stage_change',
      jsonb_build_object(
        'orderId', v_id,
        'fromStage', v_order.stage,
        'toStage', 'closed',
        'override', 'bulk_close',
        'reason', v_reason,
        'notify_discord', false,
        'message', format(
          '%s, %s: %s to Closed. Closed as stale by a manager: %s',
          v_order.guest_name,
          v_order.event_date,
          coalesce(stage_labels ->> v_order.stage, v_order.stage),
          v_reason
        )
      )
    );

    outcome := 'closed';
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.catering_bulk_close(uuid[], text) from public, anon;
grant execute on function public.catering_bulk_close(uuid[], text) to authenticated;
