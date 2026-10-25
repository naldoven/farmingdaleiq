"use server";

/**
 * Server actions for Catering (ARCHITECTURE.md "Catering (modeled on the
 * Avondale Catering Hub)"). Follows the People/Teams permission-guard
 * pattern (see app/(app)/people/actions.ts): every action calls
 * requirePermission() before any DB write, mutations go through the
 * per-request client (so RLS independently re-checks has_permission(), see
 * supabase/migrations/*_catering_rls.sql), and actions return a
 * discriminated ActionResult instead of throwing.
 *
 * Idempotency (PLAN.md ground rules -- "any action that can be double
 * submitted must be safe to run twice"):
 *   - changeStage no-ops (without re-emitting an event or re-queuing a
 *     follow-up) when the order is already on the requested stage, so a
 *     double drag/drop or a double click of the stage dropdown is a no-op.
 *   - closing an order only queues a follow-up when that order has no
 *     follow-up at all (open or resolved), so closing twice, or re-closing
 *     after a manager moved it back, cannot queue a second re-book call.
 *   - moveOrderBack and restoreOrder compare-and-set on the stage the
 *     manager saw, and a repeat that finds the order already on the target
 *     stage is a no-op success, so a double tap moves one step, not two.
 *   - toggleChecklistItem and resolveFollowUp are plain idempotent field
 *     writes: setting the same done/outcome state twice is a no-op.
 *   - rescaleOrderSetup replaces the generated packing rows inside one
 *     database transaction (catering_replace_setup) that locks the order,
 *     so a double click rebuilds the list twice in turn and never leaves two
 *     lists side by side.
 */

import { revalidatePath } from "next/cache";

import { emitEvent } from "@/lib/events/bus";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/db/types";
import type { ActionResult, OrderSearchResult } from "@/app/(app)/catering/action-types";
import {
  CANCELLED_STAGE,
  CHECKLIST_STAGE_LABELS,
  buildPhysicalOrderSetup,
  canBuildCateringSetup,
  cateringStageAdvanceError,
  checklistRequiredBeforeStageAdvance,
  classifyOrderSearch,
  defaultFollowUpDueDate,
  escapeLikePattern,
  formatOrderNewMessage,
  formatStageChangeMessage,
  formatStageOverrideMessage,
  isSetupBuildStage,
  normalizePhone,
  packingListGateError,
  parseOrderItemsFromNotes,
  planChecklistMaterialization,
  planPreOrderRows,
  planSetupRows,
  parseRequestedCondiments,
  phoneLikePattern,
  previousCateringStage,
  SETUP_BUILD_STAGES,
  setupPlanInputs,
  stageOverrideTargetError,
  type OrderStage,
} from "@/app/(app)/catering/logic";
import {
  addChecklistItemSchema,
  addOrderItemSchema,
  cancelOrderSchema,
  changeStageSchema,
  checklistDefaultIdSchema,
  checklistDefaultSchema,
  checklistItemIdSchema,
  createOrderSchema,
  menuItemIdSchema,
  menuItemSchema,
  moveOrderBackSchema,
  orderIdSchema,
  orderSearchSchema,
  orderItemIdSchema,
  resolveFollowUpSchema,
  restoreOrderSchema,
  toggleChecklistDefaultActiveSchema,
  toggleChecklistItemSchema,
  updateChecklistDefaultSchema,
  updateMenuItemSchema,
  updateOrderDetailsSchema,
  updateOrderItemQtySchema,
  type AddChecklistItemInput,
  type AddOrderItemInput,
  type CancelOrderInput,
  type ChangeStageInput,
  type ChecklistDefaultInput,
  type CreateOrderInput,
  type MenuItemInput,
  type MoveOrderBackInput,
  type OrderSearchInput,
  type ResolveFollowUpInput,
  type RestoreOrderInput,
  type ToggleChecklistDefaultActiveInput,
  type ToggleChecklistItemInput,
  type UpdateChecklistDefaultInput,
  type UpdateMenuItemInput,
  type UpdateOrderDetailsInput,
  type UpdateOrderItemQtyInput,
} from "@/app/(app)/catering/validation";

function revalidateCatering(orderId?: string) {
  revalidatePath("/catering");
  revalidatePath("/catering/week");
  revalidatePath("/catering/confirm");
  revalidatePath("/catering/setup");
  revalidatePath("/catering/dispatch");
  revalidatePath("/catering/history");
  revalidatePath("/catering/cancelled");
  revalidatePath("/catering/analytics");
  if (orderId) revalidatePath(`/catering/orders/${orderId}`);
}

/**
 * Generated setup rows are a snapshot of the receipt. Clear that snapshot
 * whenever an order changes so the day-before job never displays stale
 * supplies beside the current customer order.
 */
async function invalidateGeneratedSetup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
): Promise<string | null> {
  // Null the stamp BEFORE deleting rows. The other order left a window where
  // the stamp was old and the list already empty, so a move out of FOH Setup
  // passed the packing-list gate with nothing packed, and the cron never
  // rebuilt (it only picks up a null stamp). Leftover rows after a failed
  // delete are harmless: every build replaces generated rows.
  const { error: resetError } = await supabase
    .from("catering_orders")
    .update({ setup_generated_at: null })
    .eq("id", orderId);
  if (resetError) return resetError.message;

  const { error: deleteError } = await supabase
    .from("catering_checklist_items")
    .delete()
    .eq("order_id", orderId)
    .not("setup_section", "is", null);
  return deleteError?.message ?? null;
}

/** A manual build lost a race with an edit, a stage move or a cancel. */
const SETUP_BUILD_RACED_ERROR =
  "This order changed while its packing list was building. Refresh the page and try again.";

/**
 * Builds or rebuilds the physical packing list on request. The scheduled
 * generation itself runs from the catering cron on the calendar day before
 * the event (and on the event day for a list that is still missing). It also
 * adds any missing Pre-order items, so a list built by hand ends up with the
 * same rows as one the cron built.
 *
 * The rows are planned here and written by the catering_replace_setup
 * database function in one transaction: it locks the order, deletes the old
 * generated rows (the ones with a setup_section), inserts the new list and
 * the missing Pre-order rows, and stamps setup_generated_at last. Rows
 * without a setup_section are left alone: hand-added FOH Setup items
 * (addChecklistItem never sets one) and the Pre-order items, which live on
 * the Pickup/Delivery checklist. A manual build always replaces (p_force),
 * and two builds at once run one after the other instead of leaving two
 * lists. If the order was edited or moved after it was read here, the
 * function writes nothing and the leader is asked to try again.
 */
async function materializePhysicalOrderSetup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
): Promise<ActionResult> {
  const { data: order, error: orderError } = await supabase
    .from("catering_orders")
    .select("id, stage, event_date, headcount, paper_goods, fulfillment, notes, selected_condiments")
    .eq("id", orderId)
    .single();
  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? "Order not found." };
  }
  if (!isSetupBuildStage(order.stage)) {
    return {
      ok: false,
      error:
        order.stage === CANCELLED_STAGE
          ? "Cancelled orders cannot have a setup."
          : "This order is past Pickup/Delivery, so its packing list can't be rebuilt.",
    };
  }
  if (!canBuildCateringSetup(order.event_date)) {
    return { ok: false, error: "The packing list can't be built until the day before the event." };
  }

  // A failed read must stop the build: the line items are also what the
  // database compares against, so an empty list here would read as "changed".
  const { data: orderItems, error: orderItemsError } = await supabase
    .from("catering_order_items")
    .select("menu_item_id, qty")
    .eq("order_id", orderId);
  if (orderItemsError) return { ok: false, error: orderItemsError.message };
  const menuItemIds = (orderItems ?? []).map((item) => item.menu_item_id);
  const { data: menuItems, error: menuItemsError } = menuItemIds.length
    ? await supabase.from("catering_menu_items").select("id, name").in("id", menuItemIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (menuItemsError) return { ok: false, error: menuItemsError.message };
  const menuNameById = new Map((menuItems ?? []).map((item) => [item.id, item.name]));
  const receiptItems = parseOrderItemsFromNotes(order.notes);
  const items = receiptItems.length
    ? receiptItems
    : (orderItems ?? [])
        .map((item) => ({ name: menuNameById.get(item.menu_item_id), qty: item.qty }))
        .filter((item): item is { name: string; qty: number } => Boolean(item.name));

  const setupItems = buildPhysicalOrderSetup({
    items,
    selectedCondiments: parseRequestedCondiments(order.selected_condiments),
    headcount: order.headcount ?? 0,
    paperGoods: order.paper_goods,
    fulfillment: order.fulfillment,
  });

  const { data: built, error: buildError } = await supabase.rpc("catering_replace_setup", {
    p_order_id: orderId,
    p_force: true,
    p_stages: [...SETUP_BUILD_STAGES],
    p_planned_from: setupPlanInputs(order, orderItems ?? []),
    p_rows: planSetupRows(setupItems),
    p_preorder_rows: planPreOrderRows(),
  });
  if (buildError) return { ok: false, error: buildError.message };

  const result = built?.[0];
  if (result?.generated) return { ok: true, data: undefined };
  if (result?.outcome === "not_found") return { ok: false, error: "Order not found." };
  return { ok: false, error: SETUP_BUILD_RACED_ERROR };
}

/**
 * Best-effort event emission: the catering_orders/catering_checklist_items
 * mutations above are the source of truth for what happened; event emission
 * is notification-side plumbing consumed by other streams (S10
 * notifications/Discord). It must never turn a successful write into a
 * reported failure. Known gap (mirrors app/(app)/checklists/actions.ts):
 * `app_events` has no RLS grant yet in main (it is a P0/core table, out of
 * this stream's ownership), so emitEvent can currently throw for every
 * caller until that policy is added -- flagged in this stream's final
 * report rather than fixed here.
 */
async function emitEventSafely(...args: Parameters<typeof emitEvent>): Promise<void> {
  try {
    await emitEvent(...args);
  } catch (error) {
    console.error(`catering: emitEvent(${args[0]}) failed`, error);
  }
}

/**
 * Finds an existing contact by phone or email, or creates a new one. Kept
 * simple (ARCHITECTURE.md doesn't specify de-dup rules beyond "every guest
 * becomes a contact"): matches on a non-empty phone or email first, falls
 * back to creating a new contact from the order's guest info.
 *
 * Runs phone and email as separate `.eq()` lookups rather than one
 * PostgREST `.or("phone.eq.<value>,email.eq.<value>")` filter string --
 * `phone` is free-form input with no format validation, so splicing it
 * unescaped into a comma-separated filter expression would let a phone
 * value containing a comma or parenthesis corrupt or extend the filter.
 *
 * Phone is normalized to digits-only (normalizePhone) before both the
 * lookup and the insert (parity audit Catering finding: "Contact dedup has
 * no DB constraint and no phone normalization" -- "(555) 123-4567" and
 * "555-123-4567" now dedupe to the same contact). A DB-level unique index on
 * the normalized value would still be the stronger guarantee, but that's a
 * migration outside this stream's file ownership (app/(app)/catering/** only).
 */
async function findOrCreateContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { guestName: string; phone?: string; email?: string },
): Promise<{ id: string } | null> {
  const phone = input.phone?.trim() ? normalizePhone(input.phone.trim()) : "";
  const email = input.email?.trim();

  if (phone) {
    const { data: existing } = await supabase
      .from("catering_contacts")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
  }

  if (email) {
    const { data: existing } = await supabase
      .from("catering_contacts")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
  }

  const { data: created, error } = await supabase
    .from("catering_contacts")
    .insert({
      name: input.guestName,
      phone: phone ? phone : null,
      email: email ? email : null,
    })
    .select("id")
    .single();

  if (error || !created) return null;
  return created;
}

/**
 * Creates a catering order: finds/creates the guest contact, inserts the
 * order and its line items, and materializes the four per-stage checklists
 * from active defaults (auto-scaling FOH setup and kitchen prep quantities
 * from the order's items and headcount). Emits `catering_order_new`.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<{ orderId: string }>> {
  try {
    await requirePermission("catering.manage");
    const parsed = createOrderSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const contact = await findOrCreateContact(supabase, {
      guestName: parsed.guestName,
      phone: parsed.phone,
      email: parsed.email,
    });

    const { data: order, error: orderError } = await supabase
      .from("catering_orders")
      .insert({
        contact_id: contact?.id ?? null,
        guest_name: parsed.guestName,
        phone: parsed.phone ? parsed.phone : null,
        email: parsed.email ? parsed.email : null,
        event_date: parsed.eventDate,
        event_time: parsed.eventTime ? parsed.eventTime : null,
        headcount: parsed.headcount ?? null,
        amount: parsed.amount ?? null,
        stage: "new",
        fulfillment: parsed.fulfillment ?? null,
        delivery_address: parsed.deliveryAddress ? parsed.deliveryAddress : null,
        paper_goods: parsed.paperGoods,
        source: "manual",
        notes: parsed.notes ? parsed.notes : null,
        created_by: user?.id ?? null,
        stage_changed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return { ok: false, error: orderError?.message ?? "Could not create the order." };
    }

    if (parsed.items.length > 0) {
      const { error: itemsError } = await supabase.from("catering_order_items").insert(
        parsed.items.map((item) => ({
          order_id: order.id,
          menu_item_id: item.menuItemId,
          qty: item.qty,
        })),
      );
      if (itemsError) {
        return { ok: false, error: itemsError.message };
      }
    }

    const [{ data: defaults }, { data: menuItems }] = await Promise.all([
      supabase
        .from("catering_checklist_defaults")
        .select("stage, label, sort")
        .eq("active", true),
      parsed.items.length > 0
        ? supabase
            .from("catering_menu_items")
            .select("id, components, scaling_rules")
            .in(
              "id",
              parsed.items.map((i) => i.menuItemId),
            )
        : Promise.resolve({ data: [] as { id: string; components: unknown; scaling_rules: unknown }[] }),
    ]);

    const menuItemsById = Object.fromEntries(
      (menuItems ?? []).map((m) => [
        m.id,
        { components: m.components, scaling_rules: m.scaling_rules },
      ]),
    );

    const planned = planChecklistMaterialization({
      defaults: defaults ?? [],
      orderItems: parsed.items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
      menuItemsById,
      headcount: parsed.headcount ?? 0,
    });

    if (planned.length > 0) {
      const { error: checklistError } = await supabase.from("catering_checklist_items").insert(
        planned.map((p) => ({
          order_id: order.id,
          stage: p.stage,
          label: p.label,
          sort: p.sort,
        })),
      );
      if (checklistError) {
        return { ok: false, error: checklistError.message };
      }
    }

    await emitEventSafely("catering_order_new", {
      orderId: order.id,
      guestName: parsed.guestName,
      eventDate: parsed.eventDate,
      headcount: parsed.headcount ?? null,
      // title/message: lib/discord/format.ts's buildDiscordMessage reads
      // these off the payload (falling back to a generic per-key default),
      // so this is what makes the Discord post carry the guest/date/
      // headcount instead of just "New catering order" every time (parity
      // audit Catering finding: "Discord posts carry no order details").
      message: formatOrderNewMessage({
        guestName: parsed.guestName,
        eventDate: parsed.eventDate,
        headcount: parsed.headcount ?? null,
      }),
    });

    revalidateCatering(order.id);
    return { ok: true, data: { orderId: order.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Edits an order's own fields (not its line items or checklists). */
export async function updateOrderDetails(
  input: UpdateOrderDetailsInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = updateOrderDetailsSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("catering_orders")
      .update({
        guest_name: parsed.guestName,
        phone: parsed.phone ? parsed.phone : null,
        email: parsed.email ? parsed.email : null,
        event_date: parsed.eventDate,
        event_time: parsed.eventTime ? parsed.eventTime : null,
        headcount: parsed.headcount ?? null,
        amount: parsed.amount ?? null,
        fulfillment: parsed.fulfillment ?? null,
        delivery_address: parsed.deliveryAddress ? parsed.deliveryAddress : null,
        paper_goods: parsed.paperGoods,
        notes: parsed.notes ? parsed.notes : null,
      })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    const setupError = await invalidateGeneratedSetup(supabase, parsed.id);
    if (setupError) return { ok: false, error: setupError };

    revalidateCatering(parsed.id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Moves an order to a new pipeline stage. No-ops (no event, no follow-up
 * queued) if the order is already on `toStage` -- see file header on
 * idempotency. A leader can advance only one stage at a time, and must finish
 * the active stage's checklist before its operational handoff. Leaving FOH
 * Setup also needs the packing list to exist. Queues a re-book follow-up call
 * the first time an order reaches `closed`.
 */
export async function changeStage(input: ChangeStageInput): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = changeStageSchema.parse(input);
    const supabase = await createClient();

    const { data: order, error: fetchError } = await supabase
      .from("catering_orders")
      .select("id, stage, contact_id, event_date, guest_name, setup_generated_at")
      .eq("id", parsed.orderId)
      .single();

    if (fetchError || !order) {
      return { ok: false, error: fetchError?.message ?? "Order not found." };
    }

    if (order.stage === parsed.toStage) {
      // Already on this stage: treat as a successful no-op so a repeated
      // drag/drop or double click of the dropdown is safe.
      return { ok: true, data: undefined };
    }

    const stageError = cateringStageAdvanceError(order.stage, parsed.toStage);
    if (stageError) return { ok: false, error: stageError };

    if (order.stage === "setup") {
      const packingError = packingListGateError(order.setup_generated_at);
      if (packingError) return { ok: false, error: packingError };
    }

    const requiredChecklistStage = checklistRequiredBeforeStageAdvance(order.stage);
    if (requiredChecklistStage) {
      const { data: incompleteItem, error: checklistError } = await supabase
        .from("catering_checklist_items")
        .select("id")
        .eq("order_id", parsed.orderId)
        .eq("stage", requiredChecklistStage)
        .eq("done", false)
        .limit(1)
        .maybeSingle();
      if (checklistError) return { ok: false, error: checklistError.message };
      if (incompleteItem) {
        return {
          ok: false,
          error: `Complete every ${CHECKLIST_STAGE_LABELS[requiredChecklistStage]} item before moving on.`,
        };
      }
    }

    const fromStage = order.stage;
    const { data: moved, error: updateError } = await supabase
      .from("catering_orders")
      .update({ stage: parsed.toStage, stage_changed_at: new Date().toISOString() })
      .eq("id", parsed.orderId)
      .eq("stage", fromStage)
      .select("id")
      .maybeSingle();

    if (updateError) return { ok: false, error: updateError.message };
    if (!moved) return { ok: true, data: undefined };

    if (parsed.toStage === "closed") {
      // One re-book call per order. Moving an order back out of Closed
      // deletes its still-open call (moveOrderBack), and a resolved call
      // means the guest was already called, so re-closing never queues a
      // second one.
      const { data: existingFollowUp } = await supabase
        .from("catering_followups")
        .select("id")
        .eq("order_id", parsed.orderId)
        .limit(1)
        .maybeSingle();

      if (!existingFollowUp) {
        await supabase.from("catering_followups").insert({
          order_id: parsed.orderId,
          contact_id: order.contact_id,
          due_on: defaultFollowUpDueDate(order.event_date),
        });
      }
    }

    await emitEventSafely("catering_stage_change", {
      orderId: parsed.orderId,
      fromStage,
      toStage: parsed.toStage,
      // See the matching comment in createOrder: without message/title the
      // Discord post is the generic per-key default for every stage move.
      message: formatStageChangeMessage({
        guestName: order.guest_name,
        eventDate: order.event_date,
        fromStage: fromStage as OrderStage,
        toStage: parsed.toStage,
      }),
    });

    revalidateCatering(parsed.orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * CAT1: cancels an order (erroneous / duplicate / walked away), moving it to
 * the terminal `cancelled` stage. Unlike forcing an order to `closed`, a
 * cancelled order is excluded from every revenue/analytics/history rollup
 * (see app/(app)/catering/logic.ts NON_REVENUE_STAGES) and never queues a
 * re-book follow-up. catering.manage-gated. Idempotent: cancelling an
 * already-cancelled order is a no-op success.
 */
export async function cancelOrder(input: CancelOrderInput): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = cancelOrderSchema.parse(input);
    const supabase = await createClient();

    const { data: order, error: fetchError } = await supabase
      .from("catering_orders")
      .select("id, stage, guest_name, event_date")
      .eq("id", parsed.orderId)
      .single();

    if (fetchError || !order) {
      return { ok: false, error: fetchError?.message ?? "Order not found." };
    }

    if (order.stage === CANCELLED_STAGE) {
      // Already cancelled: treat as a successful no-op (safe double-submit).
      return { ok: true, data: undefined };
    }

    const fromStage = order.stage;
    const { data: cancelled, error: updateError } = await supabase
      .from("catering_orders")
      .update({ stage: CANCELLED_STAGE, stage_changed_at: new Date().toISOString() })
      .eq("id", parsed.orderId)
      .eq("stage", fromStage)
      .select("id")
      .maybeSingle();

    if (updateError) return { ok: false, error: updateError.message };
    if (!cancelled) return { ok: true, data: undefined };

    const { error: followUpError } = await supabase
      .from("catering_followups")
      .delete()
      .eq("order_id", parsed.orderId)
      .is("done_at", null);
    if (followUpError) return { ok: false, error: followUpError.message };

    // No follow-up is queued on cancel (that only happens on `closed`), so a
    // cancelled order never spawns a re-book call.
    await emitEventSafely("catering_stage_change", {
      orderId: parsed.orderId,
      fromStage,
      toStage: CANCELLED_STAGE,
      message: formatStageChangeMessage({
        guestName: order.guest_name,
        eventDate: order.event_date,
        fromStage: fromStage as OrderStage,
        toStage: CANCELLED_STAGE,
      }),
    });

    revalidateCatering(parsed.orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

const ORDER_CHANGED_ERROR = "This order has changed. Refresh and try again.";

/**
 * Manager undo: moves an order back one stage. Shift leaders hold
 * catering.manage and the pipeline is forward-only on purpose, so this is
 * gated on catering.override (plus catering.manage, which the write itself
 * needs) and logged with the manager's reason on the
 * same catering_stage_change event every other move emits (app_events
 * records who via emitted_by). Checklists and the packing list are left as
 * they are: the work already done is still true.
 */
export async function moveOrderBack(input: MoveOrderBackInput): Promise<ActionResult> {
  try {
    // Override first, then manage: the catering_orders and
    // catering_followups RLS write policies require catering.manage, so an
    // override holder without it would pass here and then fail at the write.
    await requirePermission("catering.override");
    await requirePermission("catering.manage");
    const parsed = moveOrderBackSchema.parse(input);

    const toStage = previousCateringStage(parsed.fromStage);
    if (!toStage) return { ok: false, error: "New orders have no earlier stage." };

    const supabase = await createClient();
    const { data: order, error: fetchError } = await supabase
      .from("catering_orders")
      .select("id, stage, event_date, event_time, guest_name")
      .eq("id", parsed.orderId)
      .single();

    if (fetchError || !order) {
      return { ok: false, error: fetchError?.message ?? "Order not found." };
    }

    if (order.stage === CANCELLED_STAGE) {
      return { ok: false, error: "This order is cancelled. Use Restore instead." };
    }

    if (order.stage !== parsed.fromStage) {
      // A repeated tap after the first move landed: the order is already
      // where the manager asked for, so report success without a second step.
      if (order.stage === toStage) return { ok: true, data: undefined };
      return { ok: false, error: ORDER_CHANGED_ERROR };
    }

    const targetError = stageOverrideTargetError(order, toStage);
    if (targetError) return { ok: false, error: targetError };

    const { data: moved, error: updateError } = await supabase
      .from("catering_orders")
      .update({ stage: toStage, stage_changed_at: new Date().toISOString() })
      .eq("id", parsed.orderId)
      .eq("stage", parsed.fromStage)
      .select("id")
      .maybeSingle();

    if (updateError) return { ok: false, error: updateError.message };
    // Unlike changeStage this is not a silent no-op: an override that did not
    // land (a race, or RLS refusing a role without catering.manage) must not
    // read as done to the manager.
    if (!moved) return { ok: false, error: ORDER_CHANGED_ERROR };

    if (parsed.fromStage === "closed") {
      // Closing queued a re-book call. An open call on an order that is no
      // longer closed would sit in History's "Follow-ups due" for a guest
      // whose order is not finished. Open calls carry no notes yet (outcome
      // and note are written when a call is resolved), so deleting loses
      // nothing, and re-closing queues a fresh one. Resolved calls stay as
      // history and stop a second call being queued.
      const { error: followUpError } = await supabase
        .from("catering_followups")
        .delete()
        .eq("order_id", parsed.orderId)
        .is("done_at", null);
      if (followUpError) {
        // The stage move already landed and is the source of truth; a left
        // over call is visible on History and can be marked done by hand.
        console.error("catering: could not remove the open follow-up after a move back", followUpError.message);
      }
    }

    await emitEventSafely("catering_stage_change", {
      orderId: parsed.orderId,
      fromStage: parsed.fromStage,
      toStage,
      override: "move_back",
      reason: parsed.reason,
      message: formatStageOverrideMessage({
        guestName: order.guest_name,
        eventDate: order.event_date,
        fromStage: parsed.fromStage,
        toStage,
        kind: "move_back",
        reason: parsed.reason,
      }),
    });

    revalidateCatering(parsed.orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Manager undo for a cancellation: puts a cancelled order back on the
 * pipeline at the stage the manager picks (RESTORE_STAGES). The stage it was
 * cancelled from is not offered as a default: it lives only in app_events,
 * which signed-in users cannot read, and storing it would need a new column.
 * Gated on catering.override plus catering.manage and logged like
 * moveOrderBack.
 */
export async function restoreOrder(input: RestoreOrderInput): Promise<ActionResult> {
  try {
    // Override first, then manage: the catering_orders and
    // catering_followups RLS write policies require catering.manage, so an
    // override holder without it would pass here and then fail at the write.
    await requirePermission("catering.override");
    await requirePermission("catering.manage");
    const parsed = restoreOrderSchema.parse(input);
    const supabase = await createClient();

    const { data: order, error: fetchError } = await supabase
      .from("catering_orders")
      .select("id, stage, event_date, event_time, guest_name")
      .eq("id", parsed.orderId)
      .single();

    if (fetchError || !order) {
      return { ok: false, error: fetchError?.message ?? "Order not found." };
    }

    if (order.stage !== CANCELLED_STAGE) {
      // A repeated tap after the restore landed is a no-op success.
      if (order.stage === parsed.toStage) return { ok: true, data: undefined };
      return { ok: false, error: "Only cancelled orders can be restored." };
    }

    const targetError = stageOverrideTargetError(order, parsed.toStage);
    if (targetError) return { ok: false, error: targetError };

    const { data: restored, error: updateError } = await supabase
      .from("catering_orders")
      .update({ stage: parsed.toStage, stage_changed_at: new Date().toISOString() })
      .eq("id", parsed.orderId)
      .eq("stage", CANCELLED_STAGE)
      .select("id")
      .maybeSingle();

    if (updateError) return { ok: false, error: updateError.message };
    if (!restored) return { ok: false, error: ORDER_CHANGED_ERROR };

    await emitEventSafely("catering_stage_change", {
      orderId: parsed.orderId,
      fromStage: CANCELLED_STAGE,
      toStage: parsed.toStage,
      override: "restore",
      reason: parsed.reason,
      message: formatStageOverrideMessage({
        guestName: order.guest_name,
        eventDate: order.event_date,
        fromStage: CANCELLED_STAGE,
        toStage: parsed.toStage,
        kind: "restore",
        reason: parsed.reason,
      }),
    });

    revalidateCatering(parsed.orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function addOrderItem(input: AddOrderItemInput): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = addOrderItemSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("catering_order_items").insert({
      order_id: parsed.orderId,
      menu_item_id: parsed.menuItemId,
      qty: parsed.qty,
    });

    if (error) return { ok: false, error: error.message };

    const setupError = await invalidateGeneratedSetup(supabase, parsed.orderId);
    if (setupError) return { ok: false, error: setupError };

    revalidateCatering(parsed.orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateOrderItemQty(
  input: UpdateOrderItemQtyInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = updateOrderItemQtySchema.parse(input);
    const supabase = await createClient();

    const { data: item, error: fetchError } = await supabase
      .from("catering_order_items")
      .select("order_id")
      .eq("id", parsed.id)
      .single();
    if (fetchError || !item) {
      return { ok: false, error: fetchError?.message ?? "Item not found." };
    }

    const { error } = await supabase
      .from("catering_order_items")
      .update({ qty: parsed.qty })
      .eq("id", parsed.id);
    if (error) return { ok: false, error: error.message };

    const setupError = await invalidateGeneratedSetup(supabase, item.order_id);
    if (setupError) return { ok: false, error: setupError };

    revalidateCatering(item.order_id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function removeOrderItem(
  input: { id: string },
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = orderItemIdSchema.parse(input);
    const supabase = await createClient();

    const { data: item, error: fetchError } = await supabase
      .from("catering_order_items")
      .select("order_id")
      .eq("id", parsed.id)
      .single();
    if (fetchError || !item) {
      return { ok: false, error: fetchError?.message ?? "Item not found." };
    }

    const { error } = await supabase.from("catering_order_items").delete().eq("id", parsed.id);
    if (error) return { ok: false, error: error.message };

    const setupError = await invalidateGeneratedSetup(supabase, item.order_id);
    if (setupError) return { ok: false, error: setupError };

    revalidateCatering(item.order_id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Adds one editable checklist item to an order's stage checklist. */
export async function addChecklistItem(
  input: AddChecklistItemInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = addChecklistItemSchema.parse(input);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("catering_checklist_items")
      .select("sort")
      .eq("order_id", parsed.orderId)
      .eq("stage", parsed.stage)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSort = (existing?.sort ?? -1) + 1;

    const { error } = await supabase.from("catering_checklist_items").insert({
      order_id: parsed.orderId,
      stage: parsed.stage,
      label: parsed.label,
      sort: nextSort,
    });

    if (error) return { ok: false, error: error.message };

    revalidateCatering(parsed.orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function toggleChecklistItem(
  input: ToggleChecklistItemInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = toggleChecklistItemSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: item, error: fetchError } = await supabase
      .from("catering_checklist_items")
      .select("order_id")
      .eq("id", parsed.id)
      .single();
    if (fetchError || !item) {
      return { ok: false, error: fetchError?.message ?? "Item not found." };
    }

    const { error } = await supabase
      .from("catering_checklist_items")
      .update({
        done: parsed.done,
        done_by: parsed.done ? (user?.id ?? null) : null,
        done_at: parsed.done ? new Date().toISOString() : null,
      })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidateCatering(item.order_id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function removeChecklistItem(
  input: { id: string },
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = checklistItemIdSchema.parse(input);
    const supabase = await createClient();

    const { data: item, error: fetchError } = await supabase
      .from("catering_checklist_items")
      .select("order_id")
      .eq("id", parsed.id)
      .single();
    if (fetchError || !item) {
      return { ok: false, error: fetchError?.message ?? "Item not found." };
    }

    const { error } = await supabase
      .from("catering_checklist_items")
      .delete()
      .eq("id", parsed.id);
    if (error) return { ok: false, error: error.message };

    revalidateCatering(item.order_id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Rebuilds the generated portion of an order's physical setup from
 * its latest receipt/menu items. Manually added setup rows stay in place;
 * only rows tagged with setup_section are replaced.
 */
export async function rescaleOrderSetup(
  input: { orderId: string },
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const { orderId } = orderIdSchema.parse({ orderId: input.orderId });
    const supabase = await createClient();

    const setupResult = await materializePhysicalOrderSetup(supabase, orderId);
    if (!setupResult.ok) return setupResult;

    revalidateCatering(orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function resolveFollowUp(
  input: ResolveFollowUpInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = resolveFollowUpSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("catering_followups")
      .update({
        done_at: new Date().toISOString(),
        outcome: parsed.outcome ? parsed.outcome : null,
        note: parsed.note ? parsed.note : null,
      })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidateCatering();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Parses admin-entered JSON array text for a jsonb column. The parsed value
 * is only ever consumed by app/(app)/catering/logic.ts's own tolerant
 * parseComponents/parseScalingRules readers (which validate shape at read
 * time), so casting to `Json` here is the same producer-side boundary cast
 * lib/events/bus.ts uses for its jsonb payload column.
 */
function parseJsonArray(text: string): Json {
  try {
    const parsed = JSON.parse(text || "[]");
    return (Array.isArray(parsed) ? parsed : []) as Json;
  } catch {
    return [] as Json;
  }
}

/** Converts a validated dollar input to integer cents so catalog prices stay exact. */
function priceTextToCents(text: string): number | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export async function createMenuItem(
  input: MenuItemInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("catering.manage");
    const parsed = menuItemSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("catering_menu_items")
      .insert({
        name: parsed.name,
        category: parsed.category ? parsed.category : null,
        pickup_price_cents: priceTextToCents(parsed.pickupPriceText),
        delivery_price_cents: priceTextToCents(parsed.deliveryPriceText),
        components: parseJsonArray(parsed.componentsText),
        scaling_rules: parseJsonArray(parsed.scalingRulesText),
        active: parsed.active,
      })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create menu item." };

    revalidatePath("/catering/menu");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateMenuItem(
  input: UpdateMenuItemInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = updateMenuItemSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("catering_menu_items")
      .update({
        name: parsed.name,
        category: parsed.category ? parsed.category : null,
        pickup_price_cents: priceTextToCents(parsed.pickupPriceText),
        delivery_price_cents: priceTextToCents(parsed.deliveryPriceText),
        components: parseJsonArray(parsed.componentsText),
        scaling_rules: parseJsonArray(parsed.scalingRulesText),
        active: parsed.active,
      })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/catering/menu");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function toggleMenuItemActive(
  input: { id: string; active: boolean },
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = menuItemIdSchema.extend({ active: updateMenuItemSchema.shape.active }).parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("catering_menu_items")
      .update({ active: parsed.active })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/catering/menu");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Deletes a menu item outright. Fails with a friendly message (instead of a
 * raw Postgres FK error) if it's referenced by any existing order -- callers
 * should use toggleMenuItemActive to retire it from the catalog instead.
 */
export async function deleteMenuItem(input: { id: string }): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = menuItemIdSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("catering_menu_items").delete().eq("id", parsed.id);

    if (error) {
      if (error.code === "23503") {
        return {
          ok: false,
          error: "This item is used on existing orders. Mark it inactive instead of deleting it.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath("/catering/menu");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Admin CRUD for catering_checklist_defaults (parity audit Catering finding:
 * "No admin UI for per-stage checklist default templates" -- the table has
 * had a catering.manage write RLS policy since the RLS migration, but until
 * now nothing in the app ever wrote to it, so createOrder's
 * planChecklistMaterialization always had zero defaults to work with).
 * Mirrors the addChecklistItem next-sort pattern: new defaults append to the
 * end of their stage's sort order.
 */
export async function createChecklistDefault(
  input: ChecklistDefaultInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("catering.manage");
    const parsed = checklistDefaultSchema.parse(input);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("catering_checklist_defaults")
      .select("sort")
      .eq("stage", parsed.stage)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSort = (existing?.sort ?? -1) + 1;

    const { data, error } = await supabase
      .from("catering_checklist_defaults")
      .insert({ stage: parsed.stage, label: parsed.label, sort: nextSort })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create the default." };

    revalidatePath("/catering/menu");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateChecklistDefault(
  input: UpdateChecklistDefaultInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = updateChecklistDefaultSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("catering_checklist_defaults")
      .update({ stage: parsed.stage, label: parsed.label, active: parsed.active })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/catering/menu");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Retires/reactivates a default without touching its stage/label/sort. */
export async function toggleChecklistDefaultActive(
  input: ToggleChecklistDefaultActiveInput,
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = toggleChecklistDefaultActiveSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("catering_checklist_defaults")
      .update({ active: parsed.active })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/catering/menu");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteChecklistDefault(input: { id: string }): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = checklistDefaultIdSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("catering_checklist_defaults")
      .delete()
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/catering/menu");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Order search for the /catering home screen. A read lives in the actions
 * file because the search box is a client component: it needs a server round
 * trip, and the per-request client keeps RLS applied. Exactly one filter
 * method is used per query. Never build a PostgREST .or(...) string from
 * typed text (see findOrCreateContact): commas and parentheses corrupt it.
 * Phone and email are matched but never returned.
 */
export async function searchCateringOrders(
  input: OrderSearchInput,
): Promise<ActionResult<OrderSearchResult[]>> {
  try {
    await requirePermission("catering.view");
    const parsed = orderSearchSchema.parse(input);
    const search = classifyOrderSearch(parsed.query);
    if (search.kind === "empty") return { ok: true, data: [] };

    const supabase = await createClient();
    let query = supabase
      .from("catering_orders")
      .select("id, guest_name, event_date, event_time, stage, headcount");
    if (search.kind === "text") {
      query = query.ilike("guest_name", `%${escapeLikePattern(search.text)}%`);
    } else if (search.kind === "phone") {
      query = query.ilike("phone", phoneLikePattern(search.digits));
    } else {
      query = query.eq("event_date", search.isoDate);
    }
    const { data, error } = await query.order("event_date", { ascending: false }).limit(20);
    if (error) return { ok: false, error: toActionError(error) };

    return {
      ok: true,
      data: (data ?? []).map((row) => ({
        id: row.id,
        guestName: row.guest_name,
        eventDate: row.event_date,
        eventTime: row.event_time,
        stage: row.stage as OrderStage,
        headcount: row.headcount,
      })),
    };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
