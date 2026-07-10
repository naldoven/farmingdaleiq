import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  composeDiscordSummary,
  composeOrderNotes,
  parseCateringEmail,
} from "@/lib/catering/inbound-email";
import { normalizePhone, planChecklistMaterialization } from "@/app/(app)/catering/logic";

/**
 * Inbound bridge for CFA catering order emails. A Google Apps Script in the
 * store's Gmail (docs/CATERING-EMAIL-INGEST.md) POSTs each "Incoming Catering
 * Order" email here as { subject, body, messageId }. The route parses it,
 * creates the order at the CONFIRM stage with its per-stage checklists, and
 * emits `catering_order_new` so the existing Discord outbox posts the summary
 * card to whatever channel Settings > Discord routes that event to.
 *
 * Auth: `Authorization: Bearer $CATERING_INBOUND_SECRET` (same pattern as the
 * cron routes). Fail-closed: no env var means every request is rejected.
 *
 * Idempotent: catering_orders.source carries `email:<orderNumber>` (falling
 * back to the Gmail message id for unparseable emails), and an order whose
 * source already exists is skipped -- Apps Script retries and re-forwarded
 * emails do not create duplicates.
 *
 * Unparseable emails still create a stub order (NEEDS REVIEW, raw email in
 * notes) so no order is ever silently dropped.
 */

const MAX_RAW_NOTES = 8000;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CATERING_INBOUND_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { subject?: unknown; body?: unknown; messageId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = typeof payload.subject === "string" ? payload.subject : "";
  const body = typeof payload.body === "string" ? payload.body : "";
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  if (!subject && !body) {
    return NextResponse.json({ error: "subject or body required" }, { status: 400 });
  }

  const parsed = parseCateringEmail({ subject, body });
  // Duplicate key: CFA order number first, Gmail message id second. With
  // neither there is no stable identity, so a random suffix keeps a second
  // unidentifiable email from being swallowed as a "duplicate" of the first.
  const sourceKey = parsed.orderNumber
    ? `email:${parsed.orderNumber}`
    : messageId
      ? `email:${messageId}`
      : `email:unparsed:${crypto.randomUUID()}`;

  const supabase = createServiceRoleClient();

  // Duplicate guard: one order per source key.
  const { data: existing, error: existingError } = await supabase
    .from("catering_orders")
    .select("id")
    .eq("source", sourceKey)
    .limit(1)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, orderId: existing.id });
  }

  // Contact: same dedupe rules as the manual createOrder action (phone
  // normalized to digits, separate eq lookups, create as fallback).
  let contactId: string | null = null;
  if (parsed.ok) {
    const phone = parsed.phone ? normalizePhone(parsed.phone) : "";
    if (phone) {
      const { data } = await supabase
        .from("catering_contacts")
        .select("id")
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      if (data) contactId = data.id;
    }
    if (!contactId && parsed.email) {
      const { data } = await supabase
        .from("catering_contacts")
        .select("id")
        .eq("email", parsed.email)
        .limit(1)
        .maybeSingle();
      if (data) contactId = data.id;
    }
    if (!contactId && parsed.guestName) {
      const { data } = await supabase
        .from("catering_contacts")
        .insert({
          name: parsed.guestName,
          phone: phone ? phone : null,
          email: parsed.email,
        })
        .select("id")
        .single();
      if (data) contactId = data.id;
    }
  }

  // Item matching: order line items can only reference existing menu items,
  // so match by exact (case-insensitive) name; everything is preserved in
  // notes either way.
  const matchedItems: { menuItemId: string; qty: number }[] = [];
  const unmatchedNames: string[] = [];
  const menuItemsById: Record<string, { components: unknown; scaling_rules: unknown }> = {};
  if (parsed.ok && parsed.items.length > 0) {
    const { data: menuItems } = await supabase
      .from("catering_menu_items")
      .select("id, name, components, scaling_rules")
      .eq("active", true);
    const byName = new Map(
      (menuItems ?? []).map((m) => [m.name.trim().toLowerCase(), m]),
    );
    for (const item of parsed.items) {
      const match = byName.get(item.name.trim().toLowerCase());
      if (match) {
        matchedItems.push({ menuItemId: match.id, qty: item.qty });
        menuItemsById[match.id] = {
          components: match.components,
          scaling_rules: match.scaling_rules,
        };
      } else {
        unmatchedNames.push(item.name);
      }
    }
  }

  const notes = parsed.ok
    ? composeOrderNotes(parsed, unmatchedNames)
    : [
        "NEEDS REVIEW: this catering email could not be fully parsed. Raw email below.",
        "",
        `Subject: ${subject}`,
        body.slice(0, MAX_RAW_NOTES),
      ].join("\n");

  const { data: order, error: orderError } = await supabase
    .from("catering_orders")
    .insert({
      contact_id: contactId,
      guest_name: parsed.guestName ?? "Unparsed catering email",
      phone: parsed.phone ? normalizePhone(parsed.phone) : null,
      email: parsed.email,
      event_date: parsed.eventDate ?? todayUtcDate(),
      event_time: parsed.eventTime,
      headcount: parsed.headcount,
      amount: parsed.amount,
      stage: "confirm",
      fulfillment: parsed.fulfillment,
      delivery_address: null,
      paper_goods: parsed.paperGoods,
      source: sourceKey,
      notes,
      created_by: null,
      stage_changed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: orderError?.message ?? "Could not create the order." },
      { status: 500 },
    );
  }

  if (matchedItems.length > 0) {
    const { error: itemsError } = await supabase.from("catering_order_items").insert(
      matchedItems.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menuItemId,
        qty: item.qty,
      })),
    );
    if (itemsError) {
      console.error("inbound catering: order items insert failed", itemsError.message);
    }
  }

  // Materialize the per-stage checklists from active defaults, mirroring the
  // manual createOrder flow.
  const { data: defaults } = await supabase
    .from("catering_checklist_defaults")
    .select("stage, label, sort")
    .eq("active", true);
  const planned = planChecklistMaterialization({
    defaults: defaults ?? [],
    orderItems: matchedItems,
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
      console.error("inbound catering: checklist insert failed", checklistError.message);
    }
  }

  // Best-effort event emission (mirrors emitEventSafely): the order row is the
  // source of truth; a failed event must not fail the ingest.
  const { error: eventError } = await supabase.from("app_events").insert({
    event_key: "catering_order_new",
    payload: {
      orderId: order.id,
      guestName: parsed.guestName ?? "Unparsed catering email",
      eventDate: parsed.eventDate ?? todayUtcDate(),
      headcount: parsed.headcount,
      message: composeDiscordSummary(parsed),
    },
  });
  if (eventError) {
    console.error("inbound catering: event emit failed", eventError.message);
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    parsed: parsed.ok,
    matchedItems: matchedItems.length,
    unmatchedItems: unmatchedNames.length,
  });
}
