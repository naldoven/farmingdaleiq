"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/guest-recovery/action-types";
import type { SendChannel } from "@/app/(app)/guest-recovery/constants";
import { outcomeMessage, sendOutcomeSummary } from "@/app/(app)/guest-recovery/view";
import {
  assignSchema,
  logRecoverySchema,
  recoveryIdSchema,
  type LogRecoveryInput,
} from "@/app/(app)/guest-recovery/validation";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { notifySpotlightAssignee } from "@/lib/guest-recovery/notify";
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
      // The database re-checks every change against the menu item's own lists.
      p_items: parsed.items.map((item) => ({
        menu_item_id: item.menuItemId,
        name: item.name,
        qty: item.qty,
        removed: item.removed,
        added: item.added,
        mod_note: item.modNote,
        receipt_ok: item.receiptOk,
        item_ok: item.itemOk,
        fault_source: item.faultSource,
      })),
      p_reason: parsed.reason,
      p_path: parsed.path,
    });
    if (error) return { ok: false, error: error.message };
    const saved = data?.[0];
    if (!saved) return { ok: false, error: "The recovery was not saved. Try again." };

    // Always run the first send, even when this was a repeat submit: the claim
    // makes it a no-op for anything already sent, and it finishes a send the
    // first attempt never reached (the server dying between save and send).
    const outcomes = await sendRecoveryMessages(saved.out_id, "initial");

    // Tell whoever owns a new Spotlight recovery. Only when this call created
    // it (a repeat submit must not ping again), and a failed notice never
    // undoes the log.
    let message = sendOutcomeSummary(outcomes);
    if (parsed.path === "spotlight" && saved.out_created) {
      if (saved.out_assigned_to) {
        let told = false;
        try {
          told = await notifySpotlightAssignee(saved.out_assigned_to);
        } catch {
          told = false;
        }
        // The recovery is saved and the list shows it either way.
        if (!told) message += " Could not tell the overseer. Tell them yourself.";
      } else {
        message +=
          " Nobody is set to send Spotlight rewards right now (no overseer, or the overseer is off and there is no backup), so nobody was notified. Check Recovery settings.";
      }
    }

    revalidateRecovery(saved.out_id);
    return { ok: true, data: { id: saved.out_id, message } };
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

/**
 * A Spotlight guest's app account did not come up, so they get the normal
 * email, text and QR instead. The database switches the path first (and clears
 * the assignee, restarts the expiry); the send is its own once-only kind, so a
 * second tap sends nothing.
 */
export async function switchToStandard(input: { id: string }): Promise<ActionResult<{ message: string }>> {
  try {
    await requirePermission("guest_recovery.log");
    const { id } = recoveryIdSchema.parse(input);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("switch_guest_recovery_to_standard", { p_id: id });
    if (error) return { ok: false, error: error.message };

    if (data === "not_found") return { ok: false, error: "That recovery was not found." };
    if (data === "not_owed") return { ok: false, error: "That recovery is not owed any more, so nothing was sent." };
    if (data === "already_standard") {
      // It was a normal recovery from the start: the guest already has the
      // normal message, and a second one would be a duplicate.
      revalidateRecovery(id);
      return { ok: true, data: { message: "That guest already had the normal message and code." } };
    }
    // "switched" and "already_switched" both send. On a retry the claims make
    // every channel that already went a no-op and finish any that never did, for
    // example when the server stopped between the switch and the send.

    const outcomes = await sendRecoveryMessages(id, "switch");
    revalidateRecovery(id);
    return { ok: true, data: { message: sendOutcomeSummary(outcomes) } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

const ASSIGN_REFUSALS: Record<string, string> = {
  not_found: "That recovery was not found.",
  not_spotlight: "Only Spotlight recoveries can be handed to someone else.",
  not_owed: "That recovery is not owed any more.",
  not_allowed: "Only the person it is assigned to, or a manager, can hand it to someone else.",
  bad_assignee: "Pick a Team Leader or above who works Guest Recovery.",
};

/** Tags another leader in on a Spotlight recovery (the overseer's day off), and tells them. */
export async function assignRecovery(input: {
  id: string;
  assigneeId: string;
}): Promise<ActionResult<{ message: string }>> {
  try {
    await requirePermission("guest_recovery.log");
    const { id, assigneeId } = assignSchema.parse(input);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("assign_guest_recovery", { p_id: id, p_assignee: assigneeId });
    if (error) return { ok: false, error: error.message };
    if (data !== "assigned") return { ok: false, error: ASSIGN_REFUSALS[data ?? ""] ?? "That could not be done." };

    let told = false;
    try {
      told = await notifySpotlightAssignee(assigneeId);
    } catch {
      told = false;
    }
    revalidateRecovery(id);
    // Assigned either way; the list shows it.
    return {
      ok: true,
      data: {
        message: told
          ? "Handed over. They have been notified."
          : "Handed over, but the notice could not be sent. Tell them yourself.",
      },
    };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
