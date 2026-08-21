import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import {
  CANCELLED_STAGE,
  FULFILLMENT_METHODS,
  buildPhysicalOrderSetup,
  formatStageChangeMessage,
  isCateringFollowUpDue,
  isCateringSetupDue,
  parseOrderItemsFromNotes,
  planPreOrderChecklist,
} from "@/app/(app)/catering/logic";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { addStoreCalendarDays, storeLocalDate } from "@/lib/time";

/**
 * Builds physical setups on the Farmingdale calendar day before the event,
 * then advances orders through Pickup/Delivery -> Follow-up once the event
 * time arrives. Vercel invokes this every minute, so neither workflow needs
 * someone to have the app open.
 *
 * The per-order update is claimed with `stage = out`. Overlapping/retried cron
 * runs therefore leave a row another invocation already moved alone and emit
 * at most one stage-change event for it.
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
    headcount: number | null;
    paper_goods: boolean;
    fulfillment: string | null;
    notes: string | null;
  },
  now: Date,
): Promise<{ generated: boolean; error?: string }> {
  const generatedAt = now.toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("catering_orders")
    .update({ setup_generated_at: generatedAt })
    .eq("id", order.id)
    .is("setup_generated_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) return { generated: false, error: claimError.message };
  if (!claimed) return { generated: false };

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
    return { generated: false, error: orderItemsError.message };
  }

  const menuItemIds = (orderItems ?? []).map((item) => item.menu_item_id);
  const { data: menuItems, error: menuItemsError } = menuItemIds.length
    ? await supabase.from("catering_menu_items").select("id, name").in("id", menuItemIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (menuItemsError) {
    await releaseClaim();
    return { generated: false, error: menuItemsError.message };
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
    headcount: order.headcount ?? 0,
    paperGoods: order.paper_goods,
    fulfillment: order.fulfillment,
  });
  const { error: insertError } = await supabase.from("catering_checklist_items").insert([
    ...setupItems.map((item, index) => ({
      order_id: order.id,
      stage: "setup",
      label: `${item.label} - ${item.qty}`,
      setup_section: item.section,
      sort: 1000 + index,
    })),
    ...planPreOrderChecklist().map((item) => ({
      order_id: order.id,
      stage: item.stage,
      label: item.label,
      sort: item.sort,
    })),
  ]);
  if (!insertError) return { generated: true };

  await releaseClaim();
  return { generated: false, error: insertError.message };
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const tomorrow = addStoreCalendarDays(storeLocalDate(now), 1);

  const { data: setupCandidates, error: setupFetchError } = await supabase
    .from("catering_orders")
    .select("id, stage, event_date, setup_generated_at, headcount, paper_goods, fulfillment, notes")
    .eq("event_date", tomorrow)
    .neq("stage", CANCELLED_STAGE)
    .neq("stage", "closed")
    .is("setup_generated_at", null);
  if (setupFetchError) {
    return NextResponse.json({ error: setupFetchError.message }, { status: 500 });
  }

  let generated = 0;
  const errors: string[] = [];
  for (const order of (setupCandidates ?? []).filter((candidate) => isCateringSetupDue(candidate, now))) {
    const result = await materializeDueSetup(supabase, order, now);
    if (result.error) {
      errors.push(`${order.id}: ${result.error}`);
    } else if (result.generated) {
      generated += 1;
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
