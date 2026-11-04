import {
  SPOTLIGHT_PROMISE_HOURS,
  STORE_ADDRESS,
  STORE_MAP_URL,
  STORE_NAME,
} from "@/app/(app)/guest-recovery/constants";

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
  /** "Good until Feb 1, 2027": how long the code works. Left out of the message when absent. */
  goodUntil?: string;
  /** The store's phone number for questions. Left out of the email when absent. */
  storePhone?: string | null;
  /** Full address of the logo image for the email header. Left out when absent. */
  logoUrl?: string | null;
  /** The team member sending the app guest's reward, named at the end of the message. Left out when absent. */
  sentBy?: string | null;
  /** Why the guest called (missing_item, wrong_item, quality, too_slow, other). Changes the wording. */
  reason?: string | null;
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

/**
 * What we say depends on why the guest called, because "was missing" is wrong
 * for cold food or a long wait, and "owe" sounds like a debt. `problem` names
 * what went wrong, `gift` introduces what we would like to give. A recovery
 * with no reason (logged before reasons existed) reads as a missing item.
 */
export function reasonCopy(
  reason: string | null | undefined,
  orderNumber: string | null,
): { problem: string; gift: string } {
  const ref = orderNumber ? `order #${orderNumber}` : "recent order";
  switch (reason) {
    case "wrong_item":
      return { problem: `Your ${ref} had the wrong item.`, gift: "We would like to make it right with:" };
    case "quality":
      return {
        problem: `Something in your ${ref} was not up to our standard.`,
        gift: "We would like to replace it, on us:",
      };
    case "too_slow":
      return { problem: `Your ${ref} took longer than it should have.`, gift: "Please enjoy this one on us:" };
    case "other":
      return {
        problem: `Thank you for telling us about your ${ref}.`,
        gift: "Here is what we would like to give you:",
      };
    default:
      return { problem: `Your ${ref} was missing items.`, gift: "We would like to replace what you did not get:" };
  }
}

/** The problem and the offer, as the two short paragraphs that sit above the items. */
function problemHtml(copy: { problem: string; gift: string }): string {
  return `<p style="margin:0;font-size:16px;line-height:1.6">${escapeHtml(copy.problem)}</p>
<p style="margin:12px 0 0;font-size:16px;line-height:1.6;font-weight:700">${escapeHtml(copy.gift)}</p>`;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * The look shared by both emails: the store's red page, the name and a big
 * headline on it, one white card for what the guest needs, and a closing line.
 * Table layout and inline styles only, because mail apps ignore the rest.
 */
function brandedEmail(parts: { first: string; card: string; questions: string; logoUrl?: string | null }): string {
  // The white version of the mark, made for a red page. Mail apps that block
  // images show nothing there and the store name below still says who it is from.
  const logo = parts.logoUrl
    ? `<img src="${escapeHtml(parts.logoUrl)}" width="52" height="52" alt="" style="display:block;border:0;margin:0 auto 14px">`
    : "";
  // The head matters on a phone: without the viewport line iOS Mail lays the
  // email out on a desktop-width canvas and the card ends up small and off to
  // one side. "light only" keeps dark-mode mail apps from recoloring the card.
  return `<!doctype html>
<html lang="en" style="background:#e51636">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(STORE_NAME)}</title>
<style>
body,table,td{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
@media only screen and (max-width:480px){
.gr-pad{padding:18px 8px !important}
.gr-card{padding:22px 18px !important}
.gr-h1{font-size:32px !important}
}
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:#e51636;font-family:'Figtree',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2a44">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#e51636">
<tr><td align="center" class="gr-pad" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px">
<tr><td align="center" style="color:#ffffff;padding:0 6px 22px">
${logo}
<p style="margin:0 0 14px;font-size:12px;letter-spacing:2px;font-weight:700;text-transform:uppercase">${escapeHtml(STORE_NAME)}</p>
<h1 class="gr-h1" style="margin:0;font-size:38px;line-height:1.08;font-weight:800">We are sorry, ${escapeHtml(parts.first)}. Let us make it right.</h1>
</td></tr>
<tr><td class="gr-card" style="background:#ffffff;border-radius:24px;padding:26px 28px">
${parts.card}
</td></tr>
<tr><td align="center" style="padding:22px 6px 0;color:#ffffff;font-size:13px;line-height:1.6">
<p style="margin:0;font-size:15px;font-weight:800">My pleasure to serve you again.</p>
<p style="margin:6px 0 0">${escapeHtml(parts.questions)}</p>
<p style="margin:6px 0 0"><a href="${escapeHtml(STORE_MAP_URL)}" style="color:#ffffff;text-decoration:underline">${escapeHtml(STORE_ADDRESS)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** One line per item, so a long order reads as a list and not a run-on sentence. */
function itemsBox(items: MessageItem[]): string {
  const lines = items.map((item) => escapeHtml(formatItems([item]))).join("<br>");
  return `<p style="margin:12px 0 0;background:#fde7eb;border-radius:16px;padding:14px 18px;font-size:19px;font-weight:800;line-height:1.5;color:#9c0f28">${lines}</p>`;
}

/** The closing question line: the store's number when we have it, else "reply". */
function questionsLine(storePhone: string | null | undefined): string {
  const phone = storePhone?.trim();
  return phone
    ? `Questions? Call the store at ${phone}, or reply to this email.`
    : "Questions? Reply to this email and the store will see it.";
}

/**
 * qrContentId, when set, points the page's QR image at an inline attachment
 * with that content id. Mail apps often block remote images and never show a
 * data: image, so the QR travels with the message instead.
 */
export function buildEmail(input: MessageInput & { qrContentId?: string }): BuiltEmail {
  const first = firstNameOf(input.guestName);
  const items = formatItems(input.items);
  const copy = reasonCopy(input.reason, input.orderNumber);
  // The store name is already the sender's display name, so the subject can lead with the apology.
  const subject = `We are sorry, ${first}. Here is your code`;
  const questions = questionsLine(input.storePhone);
  const sender = input.sentBy?.trim() || null;

  const text = [
    `Hi ${first}, we are sorry about your order. Let us make it right.`,
    "",
    `${copy.problem} ${copy.gift} ${items}`,
    "",
    `Come back and we will make it right. On your next visit to ${STORE_NAME}, bring your receipt and show this link to any team member:`,
    input.link,
    "",
    `Redeemable at ${STORE_NAME} only: ${STORE_ADDRESS}. Bring your receipt.`,
    ...(input.goodUntil ? [input.goodUntil + "."] : []),
    ...(sender ? ["", "All the best,", sender, STORE_NAME] : []),
    "",
    questions,
    "My pleasure to serve you again.",
  ].join("\n");

  const signOff = sender
    ? `
<p style="margin:18px 0 0;font-size:16px;line-height:1.6">All the best,<br><strong>${escapeHtml(sender)}</strong><br>${escapeHtml(STORE_NAME)}</p>`
    : "";

  const qr = input.qrContentId
    ? `<p style="margin:0;text-align:center"><a href="${escapeHtml(input.link)}"><img src="cid:${escapeHtml(input.qrContentId)}" width="260" height="260" alt="Your code" style="display:inline-block;width:260px;max-width:100%;height:auto;border:0"></a></p>`
    : "";

  const card = `${problemHtml(copy)}
${itemsBox(input.items)}
<p style="margin:14px 0 0;font-size:16px;line-height:1.6">Come back and we will make it right. Bring your receipt and show this email or the code below on your next visit.</p>
<p style="margin:22px 0 0;text-align:center"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#e51636;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 40px;border-radius:999px">Show my code</a></p>
<p style="margin:24px 0 16px;border-top:2px dotted #d3d6db;font-size:0;line-height:0">&nbsp;</p>
${qr}
<p style="margin:12px 0 0;text-align:center;font-size:13px;line-height:1.5;color:#6b7280">${input.goodUntil ? `${escapeHtml(input.goodUntil)}. ` : ""}Redeemable at ${escapeHtml(STORE_NAME)} only. Bring your receipt.</p>${signOff}
<p style="margin:16px 0 0;font-size:12px;color:#6b7280;line-height:1.5;word-break:break-all;overflow-wrap:anywhere">If the button does not work, copy this link into your browser:<br>${escapeHtml(input.link)}</p>`;

  return { subject, html: brandedEmail({ first, card, questions, logoUrl: input.logoUrl }), text };
}

const SMS_MAX = 480;

/**
 * The text. It names the store, says what is owed, carries the link, and gives
 * the opt-out line the carriers expect on a first message. A long item list is
 * cut to fit (the full list is on the link), never the link or the opt-out.
 */
export function buildSms(input: MessageInput): string {
  const first = firstNameOf(input.guestName);
  const head = `${STORE_NAME}: Hi ${first}, we are sorry about your order. We would like to give you: `;
  const until = input.goodUntil ? ` ${input.goodUntil}.` : "";
  const tail = `. On your next visit, show this link to a team member and bring your receipt: ${input.link}${until} Reply STOP to opt out.`;
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

/**
 * Spotlight: the guest has the Chick-fil-A app, so no code is sent. They hear
 * right away that we know about the problem and that a team member will send
 * their reward within 48 hours. No link, no QR, no promotion.
 */
export type SpotlightInput = Pick<MessageInput, "guestName" | "orderNumber" | "items" | "goodUntil" | "logoUrl" | "sentBy" | "reason"> & {
  /** The store's phone number for questions (GUEST_STORE_PHONE). Left out when absent. */
  storePhone?: string | null;
};

export function buildSpotlightEmail(input: SpotlightInput): BuiltEmail {
  const first = firstNameOf(input.guestName);
  const items = formatItems(input.items);
  const copy = reasonCopy(input.reason, input.orderNumber);
  const subject = `We are sorry, ${first}. Your reward is on its way`;
  const questions = questionsLine(input.storePhone);
  const sender = input.sentBy?.trim() || null;
  const reward = `We are sending you a reward to make it right. It will be added to your Chick-fil-A One account within ${SPOTLIGHT_PROMISE_HOURS} hours, and Chick-fil-A will email you when it is there.`;
  const redeem = `To find it, open the Chick-fil-A app and tap Rewards. To use it, add the item to your order. The reward applies on its own.${input.goodUntil ? ` ${input.goodUntil}.` : ""}`;

  const text = [
    `Hi ${first}, we are sorry about your order. Let us make it right.`,
    "",
    `${copy.problem} ${copy.gift} ${items}`,
    "",
    reward,
    "",
    redeem,
    ...(sender ? ["", "All the best,", sender, STORE_NAME] : []),
    "",
    questions,
    STORE_ADDRESS,
    "My pleasure to serve you again.",
  ].join("\n");

  const signOff = sender
    ? `
<p style="margin:18px 0 0;font-size:16px;line-height:1.6">All the best,<br><strong>${escapeHtml(sender)}</strong><br>${escapeHtml(STORE_NAME)}</p>`
    : "";

  const card = `${problemHtml(copy)}
${itemsBox(input.items)}
<p style="margin:14px 0 0;font-size:16px;line-height:1.6">${escapeHtml(reward)}</p>
<p style="margin:12px 0 0;font-size:16px;line-height:1.6">${escapeHtml(redeem)}</p>${signOff}`;

  return { subject, html: brandedEmail({ first, card, questions, logoUrl: input.logoUrl }), text };
}

export function buildSpotlightSms(input: SpotlightInput): string {
  const first = firstNameOf(input.guestName);
  const head = `${STORE_NAME}: Hi ${first}, we are sorry about your order. We would like to give you: `;
  const phone = input.storePhone?.trim();
  const tail = `. Your reward will show in the Chick-fil-A app under Rewards within ${SPOTLIGHT_PROMISE_HOURS} hours.${input.goodUntil ? ` ${input.goodUntil}.` : ""}${phone ? ` Questions? Call ${phone}.` : ""} Reply STOP to opt out.`;
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
