-- Three catering follow-ups in one migration:
--   1. The stage guard trigger's errors name stages the way the app does.
--   2. Leaders can no longer delete catering orders.
--   3. The packing list is built in one transaction (catering_replace_setup).
--
-- Deploy order: safe to apply BEFORE the code that uses it deploys. The new
-- function is not called by the old code. The policy split changes nothing
-- the app does (no user session ever deletes a catering order; the e2e
-- teardown uses the service role, which bypasses RLS). The trigger keeps
-- exactly the same rules and only reworded its two error messages. Apply this
-- first, then merge the code.
--
-- Idempotent: create or replace on both functions, policies dropped first.


-- ---------------------------------------------------------------------------
-- 1. Friendly stage names in the stage guard's errors
-- ---------------------------------------------------------------------------
-- The trigger from 20261013010000_catering_stage_transition_guard.sql raised
-- errors with raw stage keys ("cannot move from setup to new"). Those reach a
-- leader as an action error, so they now use the same labels as
-- ORDER_STAGE_LABELS in app/(app)/catering/logic.ts ("FOH Setup",
-- "Pickup/Delivery"). A key with no label falls back to the raw key.
--
-- The labels live in a jsonb constant inside the function, not in a separate
-- helper function: the trigger is SECURITY INVOKER, so a helper would need
-- EXECUTE granted to authenticated and would show up on the Data API.
--
-- Everything else is unchanged: same stage lists, same moves allowed, same
-- SECURITY INVOKER, search_path and revoke. The stage lists and the label map
-- must equal ORDER_STAGES, RESTORE_STAGES, CANCELLED_STAGE and
-- ORDER_STAGE_LABELS in logic.ts. app/(app)/catering/stage-guard-migration.test.ts
-- reads the newest migration that defines this function and fails if they
-- drift apart. The trigger itself (before insert or update of stage) is not
-- recreated; create or replace swaps the body under it.

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

  if public.has_permission('catering.override') and public.has_permission('catering.manage') then
    if from_index is not null and to_index = from_index - 1 then
      return new;
    end if;

    if old.stage = cancelled_stage and new.stage = any(restore_stages) then
      return new;
    end if;
  end if;

  raise exception 'A catering order cannot move from % to %.',
    coalesce(stage_labels ->> old.stage, old.stage),
    coalesce(stage_labels ->> new.stage, new.stage)
    using errcode = 'check_violation',
          hint = 'Leaders move one stage forward or cancel. Moving back or restoring needs catering.override.';
end;
$$;

revoke all on function public.enforce_catering_stage_transition() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Leaders cannot delete catering orders
-- ---------------------------------------------------------------------------
-- catering_orders_write (20260707040000_catering_rls.sql) was FOR ALL, so any
-- leader (catering.manage) could DELETE an order through PostgREST with their
-- own session. That bypasses the stage guard above: deleting a cancelled
-- order and inserting it again reopens it, and the delete cascades away its
-- items, checklists and follow-ups. No app path deletes a catering order with
-- a user session, so the write policy is split into INSERT and UPDATE with
-- the same catering.manage check, and no DELETE policy is created for users.
-- The default_deny policy (20260707009900_rls_default_deny.sql) then leaves
-- a user's DELETE matching zero rows. Service-role jobs bypass RLS as before.
-- Other catering tables keep their FOR ALL policies: leaders add and remove
-- order items and checklist rows by design.

drop policy if exists catering_orders_write on public.catering_orders;
drop policy if exists catering_orders_insert on public.catering_orders;
drop policy if exists catering_orders_update on public.catering_orders;

create policy catering_orders_insert on public.catering_orders
  for insert
  with check (public.has_permission('catering.manage'));

create policy catering_orders_update on public.catering_orders
  for update
  using (public.has_permission('catering.manage'))
  with check (public.has_permission('catering.manage'));


-- ---------------------------------------------------------------------------
-- 3. Atomic packing-list build
-- ---------------------------------------------------------------------------
-- Both builds (the manual "Build packing list" / "Refresh setup" in
-- app/(app)/catering/actions.ts and the every-minute cron in
-- app/api/cron/catering/route.ts) used to claim the order by stamping
-- setup_generated_at, then re-check the claim, delete the old generated rows
-- and insert the new ones, each as a separate round trip. Two builds could
-- interleave and leave a stale list beside a fresh one, and the stamp existed
-- before the rows did, so leaving FOH Setup had to wait two minutes after any
-- build. This function does the write half in one transaction instead:
--
--   * locks the order row (select ... for update), so two builds, or a build
--     and an edit's invalidation, run one after the other;
--   * returns without writing when the order is gone or hidden by RLS
--     ('not_found'), when its stage is not one the caller may build for
--     ('wrong_stage', p_stages), or when p_force is false and a list was
--     already built ('already_built', the cron's idempotency);
--   * returns without writing when the order fields or line items the caller
--     planned from (p_planned_from) no longer match the database
--     ('order_changed'). The old claim and re-check existed for exactly this:
--     an edit that lands between the caller's reads and this call. Every edit
--     nulls setup_generated_at, so the cron rebuilds from fresh data on its
--     next run, and the manual build asks the leader to try again;
--   * deletes the order's generated rows (the ones with a setup_section;
--     hand-added FOH Setup rows and the Pre-order rows have none);
--   * inserts p_rows as the new generated FOH Setup rows;
--   * inserts only the Pre-order rows from p_preorder_rows whose label is not
--     already on the order's Pickup/Delivery checklist (trimmed and case
--     insensitive), so a rebuild never duplicates them;
--   * stamps setup_generated_at = now() last, in the same transaction, so the
--     stamp is never visible without its rows.
--
-- The rows are planned in TypeScript (logic.ts buildPhysicalOrderSetup,
-- planSetupRows, planPreOrderRows, setupPlanInputs), which keeps the receipt
-- parsing and the tray guide in one tested place.
--
-- SECURITY INVOKER with search_path = public: a leader's call still goes
-- through the RLS policies on catering_orders (update, needed for the row
-- lock and the stamp) and catering_checklist_items (catering_checklist_items_write
-- is FOR ALL with catering.manage, so insert and delete are allowed). The cron
-- calls it with the service role. It is not reachable by logged-out clients.

create or replace function public.catering_replace_setup(
  p_order_id uuid,
  p_force boolean,
  p_stages text[],
  p_planned_from jsonb,
  p_rows jsonb,
  p_preorder_rows jsonb
)
returns table(generated boolean, outcome text, setup_rows integer, preorder_rows integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.catering_orders%rowtype;
  v_current jsonb;
  v_expected jsonb;
  v_setup_rows integer := 0;
  v_preorder_rows integer := 0;
begin
  -- A generated row without a section would never be replaced by the next
  -- build (only rows with a setup_section are deleted), so it would pile up.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r(row_value)
    where nullif(btrim(r.row_value ->> 'setup_section'), '') is null
  ) then
    raise exception 'Every generated packing row needs a setup_section.'
      using errcode = 'check_violation';
  end if;

  select *
    into v_order
  from public.catering_orders
  where id = p_order_id
  for update;

  if not found then
    return query select false, 'not_found'::text, 0, 0;
    return;
  end if;

  if not coalesce(v_order.stage = any(p_stages), false) then
    return query select false, 'wrong_stage'::text, 0, 0;
    return;
  end if;

  if not coalesce(p_force, false) and v_order.setup_generated_at is not null then
    return query select false, 'already_built'::text, 0, 0;
    return;
  end if;

  -- The same shape as logic.ts setupPlanInputs. Line items are compared as a
  -- set, both sides sorted the same way here, so their order does not matter.
  v_current := jsonb_build_object(
    'headcount', v_order.headcount,
    'paper_goods', v_order.paper_goods,
    'fulfillment', v_order.fulfillment,
    'notes', v_order.notes,
    'selected_condiments', v_order.selected_condiments,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object('menu_item_id', i.menu_item_id, 'qty', i.qty)
        order by i.menu_item_id::text, i.qty
      )
      from public.catering_order_items i
      where i.order_id = p_order_id
    ), '[]'::jsonb)
  );

  v_expected := coalesce(p_planned_from, '{}'::jsonb) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(e.item order by e.item ->> 'menu_item_id', (e.item ->> 'qty')::int)
      from jsonb_array_elements(coalesce(p_planned_from -> 'items', '[]'::jsonb)) as e(item)
    ), '[]'::jsonb)
  );

  if v_current is distinct from v_expected then
    return query select false, 'order_changed'::text, 0, 0;
    return;
  end if;

  delete from public.catering_checklist_items
  where order_id = p_order_id
    and setup_section is not null;

  insert into public.catering_checklist_items (order_id, stage, label, setup_section, sort)
  select p_order_id, 'setup', r.label, r.setup_section, r.sort
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(label text, setup_section text, sort integer);
  get diagnostics v_setup_rows = row_count;

  insert into public.catering_checklist_items (order_id, stage, label, sort)
  select p_order_id, 'out', p.label, p.sort
  from jsonb_to_recordset(coalesce(p_preorder_rows, '[]'::jsonb)) as p(label text, sort integer)
  where not exists (
    select 1
    from public.catering_checklist_items ci
    where ci.order_id = p_order_id
      and ci.stage = 'out'
      and lower(btrim(ci.label)) = lower(btrim(p.label))
  );
  get diagnostics v_preorder_rows = row_count;

  update public.catering_orders
  set setup_generated_at = now()
  where id = p_order_id;

  return query select true, 'built'::text, v_setup_rows, v_preorder_rows;
end;
$$;

revoke all on function public.catering_replace_setup(uuid, boolean, text[], jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.catering_replace_setup(uuid, boolean, text[], jsonb, jsonb, jsonb)
  to authenticated, service_role;
