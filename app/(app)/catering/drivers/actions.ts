"use server";

/**
 * Server actions for driver reservations (ARCHITECTURE.md "Catering" >
 * "Driver reservations"). Same guard pattern as app/(app)/catering/actions.ts:
 * requirePermission() before any read or write, zod-validated input, the
 * per-request client so RLS re-checks every write, and an ActionResult
 * instead of a throw.
 *
 * Idempotency:
 *   - setOrderDrivers writes only the difference between the picked set and
 *     what is stored, and the (order_id, profile_id) primary key ignores a
 *     repeat insert, so a double tap writes nothing the second time and the
 *     driver is told once.
 *   - setDeliveryPlatform, saveDriver, and setEscalationContact are plain
 *     field writes; repeating one is a no-op.
 */

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/catering/action-types";
import {
  DELIVERY_PLATFORMS,
  driverAssignedMessage,
  planDriverChanges,
  reservationBlockedReason,
  type DeliveryPlatform,
} from "@/app/(app)/catering/drivers/logic";
import {
  escalationContactSchema,
  saveDriverSchema,
  setDeliveryPlatformSchema,
  setOrderDriversSchema,
  type EscalationContactInput,
  type SaveDriverInput,
  type SetDeliveryPlatformInput,
  type SetOrderDriversInput,
} from "@/app/(app)/catering/drivers/validation";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { emitEvent } from "@/lib/events/bus";
import { createClient } from "@/lib/supabase/server";

function revalidateDrivers(orderId?: string) {
  revalidatePath("/catering/drivers");
  revalidatePath("/catering");
  revalidatePath("/catering/dispatch");
  revalidatePath("/");
  if (orderId) revalidatePath(`/catering/orders/${orderId}`);
}

function asPlatform(value: string): DeliveryPlatform {
  return (DELIVERY_PLATFORMS as readonly string[]).includes(value) ? (value as DeliveryPlatform) : "roadway";
}

/**
 * Makes the order's reserved drivers exactly `profileIds` (empty clears it).
 * Leaders do the real reservation first (Roadway, plus ezCater for ezCater orders); this records it
 * so the reminders stop and the driver hears about it.
 */
export async function setOrderDrivers(
  input: SetOrderDriversInput,
): Promise<ActionResult<{ added: number; removed: number }>> {
  try {
    await requirePermission("catering.drivers");
    const parsed = setOrderDriversSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: order, error: orderError } = await supabase
      .from("catering_orders")
      .select("id, guest_name, event_date, event_time, fulfillment, stage, delivery_platform")
      .eq("id", parsed.orderId)
      .maybeSingle();
    if (orderError) return { ok: false, error: orderError.message };
    if (!order) return { ok: false, error: "Order not found." };
    const blocked = reservationBlockedReason(order);
    if (blocked) return { ok: false, error: blocked };

    const { data: current, error: currentError } = await supabase
      .from("catering_order_drivers")
      .select("profile_id")
      .eq("order_id", parsed.orderId);
    if (currentError) return { ok: false, error: currentError.message };

    const changes = planDriverChanges(
      (current ?? []).map((row) => row.profile_id),
      parsed.profileIds,
    );

    let added: string[] = [];
    if (changes.add.length > 0) {
      const { data: roster, error: rosterError } = await supabase
        .from("catering_drivers")
        .select("profile_id")
        .in("profile_id", changes.add)
        .eq("active", true);
      if (rosterError) return { ok: false, error: rosterError.message };
      if ((roster ?? []).length !== changes.add.length) {
        return { ok: false, error: "Pick drivers from the active driver list." };
      }

      const { data: inserted, error: insertError } = await supabase
        .from("catering_order_drivers")
        .upsert(
          changes.add.map((profileId) => ({
            order_id: parsed.orderId,
            profile_id: profileId,
            reserved_by: user?.id ?? null,
          })),
          { onConflict: "order_id,profile_id", ignoreDuplicates: true },
        )
        .select("profile_id");
      if (insertError) return { ok: false, error: insertError.message };
      // Only rows this call created; a concurrent tap that already added the
      // same driver gets nothing back, so the driver is not told twice.
      added = (inserted ?? []).map((row) => row.profile_id);
    }

    if (changes.remove.length > 0) {
      const { error: deleteError } = await supabase
        .from("catering_order_drivers")
        .delete()
        .eq("order_id", parsed.orderId)
        .in("profile_id", changes.remove);
      if (deleteError) return { ok: false, error: deleteError.message };
    }

    if (added.length > 0) {
      const { title, message } = driverAssignedMessage({
        guestName: order.guest_name,
        eventDate: order.event_date,
        eventTime: order.event_time,
        platform: asPlatform(order.delivery_platform),
      });
      try {
        await emitEvent("catering_driver_assigned", {
          order_id: order.id,
          user_ids: added,
          actor_id: user?.id ?? null,
          title,
          message,
          link: "/",
        });
      } catch (error) {
        // The reservation is the source of truth; a lost notification must
        // not undo it or make a retry re-add the driver.
        console.error("drivers: emitEvent(catering_driver_assigned) failed", error);
      }
    }

    revalidateDrivers(parsed.orderId);
    return { ok: true, data: { added: added.length, removed: changes.remove.length } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Roadway or ezCater. Order detail, so it needs catering.manage like any other
 * order edit: whoever re-keys an ezCater order flips it, even a Team Leader.
 */
export async function setDeliveryPlatform(input: SetDeliveryPlatformInput): Promise<ActionResult> {
  try {
    await requirePermission("catering.manage");
    const parsed = setDeliveryPlatformSchema.parse(input);
    const supabase = await createClient();

    const { data: updated, error } = await supabase
      .from("catering_orders")
      .update({ delivery_platform: parsed.platform })
      .eq("id", parsed.orderId)
      .eq("fulfillment", "delivery")
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Only delivery orders have a driver app." };

    revalidateDrivers(parsed.orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Adds someone to the driver roster or edits their entry. Turning `active` off takes them off the picker. */
export async function saveDriver(input: SaveDriverInput): Promise<ActionResult> {
  try {
    await requirePermission("catering.drivers");
    const parsed = saveDriverSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (parsed.active) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", parsed.profileId)
        .eq("active", true)
        .maybeSingle();
      if (profileError) return { ok: false, error: profileError.message };
      if (!profile) return { ok: false, error: "That team member is not active." };
    }

    const { error } = await supabase.from("catering_drivers").upsert(
      {
        profile_id: parsed.profileId,
        car_size: parsed.carSize,
        has_roadway_app: parsed.hasRoadwayApp,
        has_ezcater_app: parsed.hasEzcaterApp,
        active: parsed.active,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/catering/drivers");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Who gets driver escalations. One person; null leaves escalations to Discord only. */
export async function setEscalationContact(input: EscalationContactInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = escalationContactSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (parsed.profileId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", parsed.profileId)
        .eq("active", true)
        .maybeSingle();
      if (profileError) return { ok: false, error: profileError.message };
      if (!profile) return { ok: false, error: "That team member is not active." };
    }

    const { data: updated, error } = await supabase
      .from("catering_driver_settings")
      .update({
        escalation_profile_id: parsed.profileId,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Driver settings are missing. Apply the driver reservations migration." };

    revalidatePath("/catering/drivers");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
