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
 *   - closing an order only queues a fresh follow-up when no *open*
 *     (done_at is null) follow-up already exists for that order, so closing
 *     twice cannot queue duplicate follow-up calls.
 *   - toggleChecklistItem and resolveFollowUp are plain idempotent field
 *     writes: setting the same done/outcome state twice is a no-op.
 */

import { revalidatePath } from "next/cache";

import { emitEvent } from "@/lib/events/bus";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/db/types";
import type { ActionResult } from "@/app/(app)/catering/action-types";
import {
  CANCELLED_STAGE,
  CHECKLIST_STAGES,
  defaultFollowUpDueDate,
  formatOrderNewMessage,
  formatStageChangeMessage,
  normalizePhone,
  planChecklistMaterialization,
  type ChecklistStage,
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
  orderIdSchema,
  orderItemIdSchema,
  resolveFollowUpSchema,
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
  type ResolveFollowUpInput,
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
  revalidatePath("/catering/analytics");
  if (orderId) revalidatePath(`/catering/orders/${orderId}`);
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

    revalidateCatering(parsed.id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Moves an order to a new pipeline stage. No-ops (no event, no follow-up
 * queued) if the order is already on `toStage` -- see file header on
 * idempotency. Queues a re-book follow-up call the first time an order
 * reaches `closed`.
 */
export async function changeStage(input: ChangeStageInput): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = changeStageSchema.parse(input);
    const supabase = await createClient();

    const { data: order, error: fetchError } = await supabase
      .from("catering_orders")
      .select("id, stage, contact_id, event_date, guest_name")
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

    const fromStage = order.stage;
    const { error: updateError } = await supabase
      .from("catering_orders")
      .update({ stage: parsed.toStage, stage_changed_at: new Date().toISOString() })
      .eq("id", parsed.orderId);

    if (updateError) return { ok: false, error: updateError.message };

    if (parsed.toStage === "closed") {
      const { data: openFollowUp } = await supabase
        .from("catering_followups")
        .select("id")
        .eq("order_id", parsed.orderId)
        .is("done_at", null)
        .limit(1)
        .maybeSingle();

      if (!openFollowUp) {
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
    const { error: updateError } = await supabase
      .from("catering_orders")
      .update({ stage: CANCELLED_STAGE, stage_changed_at: new Date().toISOString() })
      .eq("id", parsed.orderId);

    if (updateError) return { ok: false, error: updateError.message };

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
 * Recomputes auto-scaled FOH setup / kitchen prep quantities from the
 * order's *current* line items and headcount, and appends them as new
 * checklist rows. Additive by design (existing manually added/removed items
 * are left alone), so calling it more than once will add duplicate
 * suggestions -- an accepted v1 tradeoff documented here; managers can
 * remove any extra rows via removeChecklistItem.
 */
export async function rescaleOrderSetup(
  input: { orderId: string },
): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const { orderId } = orderIdSchema.parse({ orderId: input.orderId });
    const supabase = await createClient();

    const [{ data: order }, { data: orderItems }] = await Promise.all([
      supabase.from("catering_orders").select("id, headcount").eq("id", orderId).single(),
      supabase.from("catering_order_items").select("menu_item_id, qty").eq("order_id", orderId),
    ]);

    if (!order) return { ok: false, error: "Order not found." };

    const menuItemIds = (orderItems ?? []).map((i) => i.menu_item_id);
    const { data: menuItems } = menuItemIds.length
      ? await supabase
          .from("catering_menu_items")
          .select("id, components, scaling_rules")
          .in("id", menuItemIds)
      : { data: [] as { id: string; components: unknown; scaling_rules: unknown }[] };

    const menuItemsById = Object.fromEntries(
      (menuItems ?? []).map((m) => [m.id, { components: m.components, scaling_rules: m.scaling_rules }]),
    );

    const planned = planChecklistMaterialization({
      defaults: [],
      orderItems: (orderItems ?? []).map((i) => ({ menuItemId: i.menu_item_id, qty: i.qty })),
      menuItemsById,
      headcount: order.headcount ?? 0,
    });

    const additions = planned.filter((p): p is typeof p & { stage: ChecklistStage } =>
      CHECKLIST_STAGES.includes(p.stage),
    );

    if (additions.length > 0) {
      const { error } = await supabase.from("catering_checklist_items").insert(
        additions.map((p, i) => ({
          order_id: orderId,
          stage: p.stage,
          label: p.label,
          sort: 1000 + i,
        })),
      );
      if (error) return { ok: false, error: error.message };
    }

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
