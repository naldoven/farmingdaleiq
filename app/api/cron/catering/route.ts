import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import {
  FULFILLMENT_METHODS,
  formatStageChangeMessage,
  isCateringFollowUpDue,
} from "@/app/(app)/catering/logic";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { storeLocalDate } from "@/lib/time";

/**
 * Advances orders through the Pickup/Delivery -> Follow-up boundary once the
 * scheduled event time arrives. Vercel invokes this every minute, so the
 * transition occurs on the first cron run at or after the scheduled
 * America/New_York wall-clock time without requiring anyone to have the app
 * open.
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

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

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
  const errors: string[] = [];

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

  if (advanced > 0) {
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
