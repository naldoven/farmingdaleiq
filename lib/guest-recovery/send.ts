import type { SendChannel } from "@/app/(app)/guest-recovery/constants";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { qrPng } from "@/lib/guest-recovery/qr";
import { readConfig, sendGuestEmail, sendTwilioSms } from "@/lib/guest-recovery/providers";
import { runSends, type SendDeps, type SendKind, type SendOutcome, type SendRecovery } from "@/lib/guest-recovery/send-core";
import { goodUntilLabel } from "@/app/(app)/guest-recovery/expiry";

/**
 * Sends a saved recovery's email and text. Server only, and only after the
 * caller has checked the leader's guest_recovery.log permission: it reads the
 * guest's contact details with the service-role client, because signed-in
 * users have no write access to the send log by design.
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * The store phone number shown to app guests: the manager's setting, or the
 * GUEST_STORE_PHONE variable when none is saved. A failed read is not an error:
 * the message just says "reply to this email" instead of giving a number.
 */
async function loadStorePhone(client: ServiceClient): Promise<string | null> {
  const fallback = readConfig().storePhone;
  try {
    const { data } = await client.from("guest_recovery_settings").select("store_phone").eq("id", true).maybeSingle();
    return data?.store_phone?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function makeDeps(client: ServiceClient, storePhone: string | null): SendDeps {
  const config = readConfig();
  return {
    baseUrl: config.baseUrl,
    smsEnabled: config.smsEnabled,
    storePhone,
    emailConfigured: config.emailConfigured,
    smsConfigured: config.smsConfigured,
    async claim(recoveryId, channel, kind) {
      const { data, error } = await client.rpc("claim_guest_recovery_send", {
        p_recovery_id: recoveryId,
        p_channel: channel,
        p_kind: kind,
      });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async finish(sendId, patch) {
      const { error } = await client
        .from("guest_recovery_sends")
        .update({ status: patch.status, error: patch.error ?? null, sent_at: patch.sentAt ?? null })
        .eq("id", sendId);
      if (error) throw new Error(error.message);
    },
    async isOptedOut(phone) {
      const { data, error } = await client.from("guest_sms_optouts").select("phone").eq("phone", phone).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    async recordOptOut(phone) {
      await client.from("guest_sms_optouts").upsert({ phone }, { onConflict: "phone", ignoreDuplicates: true });
    },
    qrPng,
    sendEmail: (args) => sendGuestEmail(args),
    sendSms: (args) => sendTwilioSms(args),
  };
}

async function loadSendRecovery(client: ServiceClient, recoveryId: string): Promise<SendRecovery | null> {
  const { data: row, error: rowError } = await client
    .from("guest_recoveries")
    .select("id, token, guest_name, guest_email, guest_phone, order_number, sms_consent, status, path, expires_at, assigned_to")
    .eq("id", recoveryId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  // Only an owed recovery gets messages: a voided or handed-over one must not
  // be sent again.
  if (!row || row.status !== "owed") return null;

  const { data: items, error: itemsError } = await client
    .from("guest_recovery_items")
    .select("name, qty")
    .eq("recovery_id", recoveryId)
    .order("name");
  if (itemsError) throw new Error(itemsError.message);

  // An app guest's reward comes from the person it is assigned to: name them.
  let sentBy: string | null = null;
  if (row.path === "spotlight" && row.assigned_to) {
    const { data: person } = await client.from("profiles").select("name").eq("id", row.assigned_to).maybeSingle();
    sentBy = person?.name?.trim() || null;
  }

  return {
    id: row.id,
    token: row.token,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    orderNumber: row.order_number,
    smsConsent: row.sms_consent,
    path: row.path === "spotlight" ? "spotlight" : "standard",
    goodUntil: goodUntilLabel(row.expires_at),
    sentBy,
    items: (items ?? []).map((item) => ({ name: item.name, qty: item.qty })),
  };
}

/**
 * Sends the first email and text for a recovery, or a resend of the given
 * channels. Never throws. An empty result means the recovery is not owed (or
 * does not exist); a database failure comes back as failed outcomes instead, so
 * the leader is told to retry rather than that nothing is owed.
 */
export async function sendRecoveryMessages(
  recoveryId: string,
  kind: SendKind,
  channels?: SendChannel[],
): Promise<SendOutcome[]> {
  try {
    const client = createServiceRoleClient();
    const recovery = await loadSendRecovery(client, recoveryId);
    if (!recovery) return [];
    return await runSends(recovery, kind, makeDeps(client, await loadStorePhone(client)), channels);
  } catch {
    const reason = "Could not reach the database. Nothing was sent. Try again.";
    return (channels ?? ["email", "sms"]).map((channel) => ({ channel, result: "failed" as const, reason }));
  }
}
