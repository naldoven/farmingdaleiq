import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import {
  FULFILLMENT_METHODS,
  buildPhysicalOrderSetup,
  formatStageChangeMessage,
  isCateringFollowUpDue,
  isCateringSetupDue,
  parseOrderItemsFromNotes,
  parseRequestedCondiments,
  planMissingPreOrderChecklist,
} from "@/app/(app)/catering/logic";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { addStoreCalendarDays, storeLocalDate } from "@/lib/time";

/**
 * Builds physical setups on the Farmingdale calendar day before the event
 * (and on the event day when the list is still missing, for same-day orders
 * or a list wiped by an edit), then advances orders through Pickup/Delivery
 * -> Follow-up once the event time arrives. Vercel invokes this every minute,
 * so neither workflow needs someone to have the app open.
 *
 * Each setup is claimed by `setup_generated_at`, then the stage transition is
 * guarded by its prior value. A cancellation or manual move can therefore win
 * without being overwritten by this background job.
 *
 * The job only moves an order to FOH Setup when its Confirmation Call
 * checklist is complete, the same rule a leader's manual move must pass.
 * Otherwise the order keeps its packing list but stays where it is, and the
 * board shows it as "Call not done" (logic.ts isConfirmationCallLate).
 */

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function revalidateCatering() {
  revalidatePath("/catering");
  revalidatePath("/catering/week");
  revalidatePath("/catering/dispatch");
  revalidatePath("/catering/history");
}

async function materializeDueSetup(
  supabase: ReturnType<typeof createServiceRoleClient>,
  order: {
    id: string;
    stage: string;
    guest_name: string;
    headcount: number | null;
    paper_goods: boolean;
    fulfillment: string | null;
    notes: string | null;
    selected_condiments: unknown;
  },
  now: Date,
  confirmationCallDone: boolean,
): Promise<{ generated: boolean; movedToSetup: boolean; error?: string }> {
  const generatedAt = now.toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("catering_orders")
    .update({ setup_generated_at: generatedAt })
    .eq("id", order.id)
    .in("stage", ["new", "confirm", "setup"])
    .is("setup_generated_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) return { generated: false, movedToSetup: false, error: claimError.message };
  if (!claimed) return { generated: false, movedToSetup: false };

  const releaseClaim = async () => {
    await supabase
      .from("catering_orders")
      .update({ setup_generated_at: null })
      .eq("id", order.id)
      .eq("setup_generated_at", generatedAt);
  };

  const { data: orderItems, error: orderItemsError } = await supabase
    .from("catering_order_items")
    .select("menu_item_id, qty")
    .eq("order_id", order.id);
  if (orderItemsError) {
    await releaseClaim();
    return { generated: false, movedToSetup: false, error: orderItemsError.message };
  }

  const menuItemIds = (orderItems ?? []).map((item) => item.menu_item_id);
  const { data: menuItems, error: menuItemsError } = menuItemIds.length
    ? await supabase.from("catering_menu_items").select("id, name").in("id", menuItemIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (menuItemsError) {
    await releaseClaim();
    return { generated: false, movedToSetup: false, error: menuItemsError.message };
  }

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

  // An edit wipes only the packing list rows, so the Pre-order rows from the
  // first build are still there when the list is rebuilt. Add only the ones
  // that are missing.
  const { data: existingPreOrder, error: existingPreOrderError } = await supabase
    .from("catering_checklist_items")
    .select("label")
    .eq("order_id", order.id)
    .eq("stage", "out");
  if (existingPreOrderError) {
    await releaseClaim();
    return { generated: false, movedToSetup: false, error: existingPreOrderError.message };
  }

  const { error: insertError } = await supabase.from("catering_checklist_items").insert([
    ...setupItems.map((item, index) => ({
      order_id: order.id,
      stage: "setup",
      label: `${item.label} - ${item.qty}`,
      setup_section: item.section,
      sort: 1000 + index,
    })),
    ...planMissingPreOrderChecklist((existingPreOrder ?? []).map((item) => item.label)).map((item) => ({
      order_id: order.id,
      stage: item.stage,
      label: item.label,
      sort: item.sort,
    })),
  ]);
  if (insertError) {
    await releaseClaim();
    return { generated: false, movedToSetup: false, error: insertError.message };
  }

  if (order.stage === "setup" || !confirmationCallDone) return { generated: true, movedToSetup: false };

  const { data: moved, error: moveError } = await supabase
    .from("catering_orders")
    .update({ stage: "setup", stage_changed_at: generatedAt })
    .eq("id", order.id)
    .eq("stage", order.stage)
    .select("id")
    .maybeSingle();
  if (moveError) return { generated: true, movedToSetup: false, error: moveError.message };
  return { generated: true, movedToSetup: Boolean(moved) };
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const today = storeLocalDate(now);
  const tomorrow = addStoreCalendarDays(today, 1);

  const { data: setupCandidates, error: setupFetchError } = await supabase
    .from("catering_orders")
    .select("id, stage, guest_name, event_date, setup_generated_at, headcount, paper_goods, fulfillment, notes, selected_condiments")
    .in("event_date", [today, tomorrow])
    .in("stage", ["new", "confirm", "setup"])
    .is("setup_generated_at", null);
  if (setupFetchError) {
    return NextResponse.json({ error: setupFetchError.message }, { status: 500 });
  }

  const dueSetups = (setupCandidates ?? []).filter((candidate) => isCateringSetupDue(candidate, now));
  const errors: string[] = [];

  // Same rule as changeStage's guard before an order leaves Confirmation
  // Call: the call is done when the order has no undone Confirmation Call
  // item. One query for every candidate rather than one per order.
  const callPendingIds = new Set<string>();
  const awaitingCall = dueSetups.filter((order) => order.stage !== "setup").map((order) => order.id);
  if (awaitingCall.length > 0) {
    const { data: undoneCallItems, error: callFetchError } = await supabase
      .from("catering_checklist_items")
      .select("order_id")
      .in("order_id", awaitingCall)
      .eq("stage", "confirm")
      .eq("done", false);
    if (callFetchError) {
      // Fail safe: still build the packing lists, but move nothing when the
      // call status cannot be read. A leader can move a confirmed order.
      errors.push(`confirmation calls: ${callFetchError.message}`);
      for (const id of awaitingCall) callPendingIds.add(id);
    }
    for (const item of undoneCallItems ?? []) callPendingIds.add(item.order_id);
  }

  let generated = 0;
  const setupOrderIds: string[] = [];
  for (const order of dueSetups) {
    const result = await materializeDueSetup(supabase, order, now, !callPendingIds.has(order.id));
    if (result.error) {
      errors.push(`${order.id}: ${result.error}`);
    } else if (result.generated) {
      generated += 1;
      setupOrderIds.push(order.id);
      if (result.movedToSetup) {
        const { error: eventError } = await supabase.from("app_events").insert({
          event_key: "catering_stage_change",
          payload: {
            orderId: order.id,
            fromStage: order.stage,
            toStage: "setup",
            message: formatStageChangeMessage({
              guestName: order.guest_name,
              eventDate: order.event_date,
              fromStage: order.stage as "new" | "confirm",
              toStage: "setup",
            }),
          },
        });
        if (eventError) console.error(`catering cron: failed to emit setup event for ${order.id}`, eventError.message);
      }
    }
  }

  // Limit the sweep to active handoffs on or before today's store date. The
  // pure due-time check below still handles the precise time and malformed or
  // missing values safely.
  const { data: activeHandoffs, error: fetchError } = await supabase
    .from("catering_orders")
    .select("id, stage, fulfillment, event_date, event_time, guest_name")
    .eq("stage", "out")
    .in("fulfillment", [...FULFILLMENT_METHODS])
    .lte("event_date", storeLocalDate(now));
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const dueOrders = (activeHandoffs ?? []).filter((order) => isCateringFollowUpDue(order, now));
  let advanced = 0;
  const advancedOrderIds: string[] = [];
  for (const order of dueOrders) {
    const { data: transitioned, error: updateError } = await supabase
      .from("catering_orders")
      .update({ stage: "followup", stage_changed_at: now.toISOString() })
      .eq("id", order.id)
      .eq("stage", "out")
      .select("id");
    if (updateError) {
      errors.push(`${order.id}: ${updateError.message}`);
      continue;
    }
    if (!transitioned || transitioned.length === 0) continue;

    advanced += 1;
    advancedOrderIds.push(order.id);
    const { error: eventError } = await supabase.from("app_events").insert({
      event_key: "catering_stage_change",
      payload: {
        orderId: order.id,
        fromStage: "out",
        toStage: "followup",
        message: formatStageChangeMessage({
          guestName: order.guest_name,
          eventDate: order.event_date,
          fromStage: "out",
          toStage: "followup",
        }),
      },
    });
    if (eventError) {
      // The order transition is the source of truth. A notification failure
      // must not roll it back or make the next run emit a duplicate event.
      console.error(`catering cron: failed to emit stage event for ${order.id}`, eventError.message);
    }
  }

  if (generated > 0 || advanced > 0) {
    revalidateCatering();
    for (const orderId of advancedOrderIds) {
      revalidatePath(`/catering/orders/${orderId}`);
    }
    for (const orderId of setupOrderIds) {
      revalidatePath(`/catering/orders/${orderId}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    scanned: activeHandoffs?.length ?? 0,
    advanced,
    errors,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
