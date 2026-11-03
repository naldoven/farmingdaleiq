"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/guest-recovery/action-types";
import type { SendChannel } from "@/app/(app)/guest-recovery/constants";
import { outcomeMessage, sendOutcomeSummary } from "@/app/(app)/guest-recovery/view";
import {
  logRecoverySchema,
  recoveryIdSchema,
  type LogRecoveryInput,
} from "@/app/(app)/guest-recovery/validation";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { sendRecoveryMessages } from "@/lib/guest-recovery/send";
import { createClient } from "@/lib/supabase/server";

/**
 * Guest Recovery server actions (ARCHITECTURE.md "Guest Recovery"). Every one
 * checks guest_recovery.log first, validates with the zod schema, and writes
 * through the per-request client, so the database functions re-check the same
 * permission (log_guest_recovery, give_guest_recovery, void_guest_recovery).
 *
 * Safe to run twice:
 *   - logRecovery: the form's submission id makes a second call return the
 *     recovery the first one made, and the send claim stops a second email.
 *   - giveRecovery / voidRecovery: only an owed recovery moves.
 *   - resendRecovery: the database refuses a second send within 30 seconds.
 */

function revalidateRecovery(id?: string) {
  revalidatePath("/guest-recovery");
  if (id) revalidatePath(`/guest-recovery/${id}`);
}

export async function logRecovery(
  input: LogRecoveryInput,
): Promise<ActionResult<{ id: string; message: string }>> {
  try {
    await requirePermission("guest_recovery.log");
    const parsed = logRecoverySchema.parse(input);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("log_guest_recovery", {
      p_submission_id: parsed.submissionId,
      p_guest_name: parsed.guestName,
      p_guest_email: parsed.guestEmail,
      p_guest_phone: parsed.guestPhone,
      p_order_number: parsed.orderNumber,
      p_note: parsed.note,
      p_sms_consent: parsed.smsConsent,
      p_items: parsed.items.map((item) => ({ menu_item_id: item.menuItemId, name: item.name, qty: item.qty })),
    });
    if (error) return { ok: false, error: error.message };
    const saved = data?.[0];
    if (!saved) return { ok: false, error: "The recovery was not saved. Try again." };

    // Always run the first send, even when this was a repeat submit: the claim
    // makes it a no-op for anything already sent, and it finishes a send the
    // first attempt never reached (the server dying between save and send).
    const outcomes = await sendRecoveryMessages(saved.out_id, "initial");

    revalidateRecovery(saved.out_id);
    return { ok: true, data: { id: saved.out_id, message: sendOutcomeSummary(outcomes) } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function resendRecovery(input: {
  id: string;
  channels?: SendChannel[];
}): Promise<ActionResult<{ message: string }>> {
  try {
    await requirePermission("guest_recovery.log");
    const { id } = recoveryIdSchema.parse({ id: input.id });
    const channels = input.channels?.filter((c) => c === "email" || c === "sms");

    const outcomes = await sendRecoveryMessages(id, "resend", channels && channels.length > 0 ? channels : undefined);
    if (outcomes.length === 0) {
      return { ok: false, error: "That recovery is not owed any more, so nothing was sent." };
    }
    if (outcomes.every((o) => o.result === "too_soon")) {
      return { ok: false, error: "Just sent. Give it a minute before sending again." };
    }

    revalidateRecovery(id);
    return { ok: true, data: { message: sendOutcomeSummary(outcomes) } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function giveRecovery(input: { id: string }): Promise<ActionResult<{ message: string }>> {
  try {
    await requirePermission("guest_recovery.log");
    const { id } = recoveryIdSchema.parse(input);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("give_guest_recovery", { p_id: id });
    if (error) return { ok: false, error: error.message };

    const outcome = outcomeMessage("give", data ?? "");
    revalidateRecovery(id);
    return outcome.ok ? { ok: true, data: { message: outcome.message } } : { ok: false, error: outcome.message };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function voidRecovery(input: { id: string }): Promise<ActionResult<{ message: string }>> {
  try {
    await requirePermission("guest_recovery.log");
    const { id } = recoveryIdSchema.parse(input);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("void_guest_recovery", { p_id: id });
    if (error) return { ok: false, error: error.message };

    const outcome = outcomeMessage("void", data ?? "");
    revalidateRecovery(id);
    return outcome.ok ? { ok: true, data: { message: outcome.message } } : { ok: false, error: outcome.message };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
