import { STORE_NAME } from "@/app/(app)/guest-recovery/constants";

/**
 * The words a guest reads: the email and the text. Plain short sentences, no
 * promotions (a text with a coupon in it would need separate written marketing
 * consent), and the store name up front so the guest knows who is writing.
 * Everything a leader typed is escaped before it goes into the HTML.
 */

export interface MessageItem {
  name: string;
  qty: number;
}

export interface MessageInput {
  guestName: string;
  orderNumber: string | null;
  items: MessageItem[];
  link: string;
}

/** "2 x Medium Mac & Cheese, Spicy Deluxe Sandwich". A count shows only above one. */
export function formatItems(items: MessageItem[]): string {
  return items.map((item) => (item.qty > 1 ? `${item.qty} x ${item.name}` : item.name)).join(", ");
}

export function firstNameOf(guestName: string): string {
  return guestName.trim().split(/\s+/)[0] || "there";
}

/** The guest's link: the app address plus /recover/<token>. */
export function recoveryLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/recover/${token}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function orderPhrase(orderNumber: string | null): string {
  return orderNumber ? `Your order #${orderNumber} was missing:` : "Your recent order was missing:";
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * qrContentId, when set, points the page's QR image at an inline attachment
 * with that content id. Mail apps often block remote images and never show a
 * data: image, so the QR travels with the message instead.
 */
export function buildEmail(input: MessageInput & { qrContentId?: string }): BuiltEmail {
  const first = firstNameOf(input.guestName);
  const items = formatItems(input.items);
  const subject = `Your ${STORE_NAME} order: how we will make it right`;

  const text = [
    `Hi ${first}, thank you for telling us about your order.`,
    "",
    `${orderPhrase(input.orderNumber)} ${items}`,
    "",
    `We would like to make it right. On your next visit to ${STORE_NAME}, bring your receipt and show this link to any team member:`,
    input.link,
    "",
    `Good at ${STORE_NAME} only. Bring your receipt.`,
    "",
    "Questions? Reply to this email and the store will see it.",
  ].join("\n");

  const qr = input.qrContentId
    ? `<p style="margin:20px 0 0;text-align:center"><img src="cid:${escapeHtml(input.qrContentId)}" width="180" height="180" alt="Your code" style="display:inline-block"></p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2a44">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;font-weight:700;color:#e51636;text-transform:uppercase">${escapeHtml(STORE_NAME)}</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">Hi ${escapeHtml(first)}, thank you for telling us about your order.</h1>
<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${escapeHtml(orderPhrase(input.orderNumber))}</p>
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#9c0f28">${escapeHtml(items)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">We would like to make it right. On your next visit, bring your receipt and show this code to any team member.</p>
<p style="margin:0;text-align:center"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#e51636;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px">View my code</a></p>
${qr}
<p style="margin:24px 0 0;padding:12px 14px;background:#fef3c7;border-radius:12px;font-size:13px;line-height:1.5"><strong>Good at ${escapeHtml(STORE_NAME)} only.</strong><br>Bring your receipt.</p>
<p style="margin:20px 0 0;font-size:12px;color:#6b7280;line-height:1.5">If the button does not work, copy this link into your browser:<br>${escapeHtml(input.link)}</p>
<p style="margin:12px 0 0;font-size:12px;color:#6b7280">Questions? Reply to this email and the store will see it.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}

const SMS_MAX = 480;

/**
 * The text. It names the store, says what is owed, carries the link, and gives
 * the opt-out line the carriers expect on a first message. A long item list is
 * cut to fit (the full list is on the link), never the link or the opt-out.
 */
export function buildSms(input: MessageInput): string {
  const first = firstNameOf(input.guestName);
  const head = `${STORE_NAME}: Hi ${first}, thanks for telling us about your order. We owe you: `;
  const tail = `. On your next visit, show this link to a team member and bring your receipt: ${input.link} Reply STOP to opt out.`;
  const budget = SMS_MAX - head.length - tail.length;

  let shown = input.items.length;
  let list = formatItems(input.items);
  while (list.length > budget && shown > 1) {
    shown -= 1;
    const more = input.items.length - shown;
    list = `${formatItems(input.items.slice(0, shown))} and ${more} more`;
  }
  return `${head}${list}${tail}`;
}
