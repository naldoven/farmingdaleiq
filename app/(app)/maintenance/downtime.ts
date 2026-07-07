/**
 * Shared (non-"use server") helpers for opening/closing equipment_downtime
 * spans, used by both app/(app)/maintenance/actions.ts (completing a work
 * order can close a span) and app/(app)/maintenance/equipment/actions.ts
 * (the manual operational/down toggle). Not a Server Action file itself —
 * "use server" files may only export async functions, so this plain module
 * holds the shared logic both action files call into.
 *
 * Idempotency: both directions no-op when there's nothing to do (no open
 * span to close; already has an open span so no duplicate is opened),
 * matching PLAN.md's "safe to run twice" rule.
 */
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/bus";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Opens a new downtime span for `equipmentId` (unless one is already open)
 * and flips equipment.status to "down". Returns true if it changed anything.
 */
export async function openDowntimeSpan(
  supabase: SupabaseClient,
  equipmentId: string,
  workOrderId?: string | null,
): Promise<void> {
  const { data: openSpan } = await supabase
    .from("equipment_downtime")
    .select("id")
    .eq("equipment_id", equipmentId)
    .is("ended_at", null)
    .limit(1)
    .maybeSingle();

  if (!openSpan) {
    await supabase.from("equipment_downtime").insert({
      equipment_id: equipmentId,
      work_order_id: workOrderId ?? null,
      started_at: new Date().toISOString(),
    });
  }

  const { data: updated } = await supabase
    .from("equipment")
    .update({ status: "down" })
    .eq("id", equipmentId)
    .eq("status", "operational")
    .select("id")
    .maybeSingle();

  if (updated) {
    await emitEvent("equipment_down", { equipmentId });
  }
}

/**
 * Closes the latest open downtime span (if any) for `equipmentId` and flips
 * equipment.status back to "operational".
 */
export async function closeOpenDowntimeSpan(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<void> {
  const { data: openSpan } = await supabase
    .from("equipment_downtime")
    .select("id")
    .eq("equipment_id", equipmentId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openSpan) {
    await supabase
      .from("equipment_downtime")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", openSpan.id)
      .is("ended_at", null);
  }

  const { data: updated } = await supabase
    .from("equipment")
    .update({ status: "operational" })
    .eq("id", equipmentId)
    .eq("status", "down")
    .select("id")
    .maybeSingle();

  if (updated) {
    await emitEvent("equipment_up", { equipmentId });
  }
}
