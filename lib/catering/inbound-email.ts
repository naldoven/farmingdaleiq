/**
 * Parser for CFA catering order notification emails (the "Incoming Catering
 * Order: Pickup/Delivery Order Received for (NNNNN)" emails the store's FSU
 * inbox receives from one@email.chick-fil-a.com and auto-forwards to Gmail).
 *
 * Pure module: no Supabase/Next imports so it is unit-testable on its own
 * (lib/catering/inbound-email.test.ts drives it from a real sample). Consumed
 * by app/api/inbound/catering/route.ts.
 *
 * Input is the email's plain-text body as Gmail's getPlainBody() returns it:
 * quoted-printable already decoded, possibly wrapped in an Outlook forward
 * header block. Parsing is line-based against the fixed CFA template; every
 * field is best-effort so a format drift degrades to an incomplete parse
 * (ok=false) instead of a throw -- the route then files a NEEDS REVIEW stub
 * so no order is ever silently dropped.
 */

export interface ParsedCateringItem {
  name: string;
  qty: number;
  /** Display price string exactly as emailed (e.g. "$10.83"), if present. */
  price: string | null;
}

export interface ParsedCateringEmail {
  ok: boolean;
  orderNumber: string | null;
  fulfillment: "pickup" | "delivery" | null;
  /** YYYY-MM-DD */
  eventDate: string | null;
  /** HH:MM, 24-hour */
  eventTime: string | null;
  guestName: string | null;
  phone: string | null;
  email: string | null;
  headcount: number | null;
  paperGoods: boolean;
  specialInstructions: string | null;
  items: ParsedCateringItem[];
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  /** Numeric value of `total`, for catering_orders.amount. */
  amount: number | null;
}

const MONEY_RE = /^\$\d[\d,]*\.\d{2}$/;
const QTY_RE = /^\d{1,4}$/;

function moneyToNumber(money: string | null): number | null {
  if (!money) return null;
  const value = Number(money.replace(/[$,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function to24Hour(hour12: number, minute: string, meridiem: string): string {
  let hour = hour12 % 12;
  if (meridiem.toLowerCase() === "pm") hour += 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/** First "M/D/YYYY at H:MMam" style stamp after a "Pickup/Delivery Time" label. */
function parseWhen(lines: string[]): { date: string | null; time: string | null } {
  const timeLabelIndex = lines.findIndex((l) => /^(pickup|delivery)\s+time$/i.test(l));
  const searchSpace = timeLabelIndex >= 0 ? lines.slice(timeLabelIndex, timeLabelIndex + 3) : lines;
  for (const line of searchSpace) {
    const match = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (match) {
      const [, month, day, year, hour, minute, meridiem] = match;
      return {
        date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
        time: to24Hour(Number(hour), minute, meridiem),
      };
    }
  }
  return { date: null, time: null };
}

function parseCustomer(lines: string[]): { name: string | null; phone: string | null; email: string | null } {
  const start = lines.findIndex((l) => /^customer information$/i.test(l));
  if (start < 0) return { name: null, phone: null, email: null };
  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  for (const line of lines.slice(start + 1, start + 6)) {
    if (/^(guest count|paper goods|special instructions|item name)/i.test(line)) break;
    if (/^\+?[\d\s().-]{7,}$/.test(line)) phone = phone ?? line.replace(/\s+/g, "");
    else if (line.includes("@")) email = email ?? line.trim();
    else name = name ?? line.trim();
  }
  return { name, phone, email };
}

function parseInstructions(lines: string[]): string | null {
  const start = lines.findIndex((l) => /^special instructions$/i.test(l));
  if (start < 0) return null;
  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^item name$/i.test(line) || /^subtotal$/i.test(line)) break;
    collected.push(line);
  }
  const text = collected.join("\n").trim();
  return text ? text : null;
}

function parseItems(lines: string[]): ParsedCateringItem[] {
  // The item table serializes as: "Item Name" / "Quantity" / "Price" header
  // lines, then repeating [name, qty, optional price] triples until Subtotal.
  const headerIndex = lines.findIndex((l) => /^item name$/i.test(l));
  if (headerIndex < 0) return [];
  const items: ParsedCateringItem[] = [];
  let current: ParsedCateringItem | null = null;
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^subtotal$/i.test(line)) break;
    if (/^(quantity|price)$/i.test(line)) continue;
    if (MONEY_RE.test(line)) {
      if (current) current.price = line;
      continue;
    }
    if (QTY_RE.test(line)) {
      if (current) current.qty = Number(line);
      continue;
    }
    current = { name: line, qty: 1, price: null };
    items.push(current);
  }
  return items;
}

/** Money value on the label's own line ("Total $5.00") or the next line. */
function parseLabeledMoney(lines: string[], label: RegExp): string | null {
  const index = lines.findIndex((l) => label.test(l));
  if (index < 0) return null;
  const inline = lines[index].match(/\$\d[\d,]*\.\d{2}/);
  if (inline) return inline[0];
  const next = lines[index + 1];
  return next && MONEY_RE.test(next) ? next : null;
}

export function parseCateringEmail(input: { subject: string; body: string }): ParsedCateringEmail {
  const haystack = `${input.subject}\n${input.body}`;
  const lines = input.body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const orderNumber = haystack.match(/order received for \((\d+)\)/i)?.[1]
    ?? haystack.match(/catering (?:pickup|delivery) order for (\d+)/i)?.[1]
    ?? null;

  const fulfillment = /delivery order/i.test(haystack)
    ? ("delivery" as const)
    : /pickup order/i.test(haystack)
      ? ("pickup" as const)
      : null;

  const when = parseWhen(lines);
  const customer = parseCustomer(lines);
  const headcount = haystack.match(/guest count:\s*(\d+)/i)?.[1] ?? null;
  const paperGoods = /paper goods:\s*yes/i.test(haystack);
  const total = parseLabeledMoney(lines, /^total\b/i);

  const parsed: ParsedCateringEmail = {
    ok: false,
    orderNumber,
    fulfillment,
    eventDate: when.date,
    eventTime: when.time,
    guestName: customer.name,
    phone: customer.phone,
    email: customer.email,
    headcount: headcount ? Number(headcount) : null,
    paperGoods,
    specialInstructions: parseInstructions(lines),
    items: parseItems(lines),
    subtotal: parseLabeledMoney(lines, /^subtotal\b/i),
    tax: parseLabeledMoney(lines, /^tax\b/i),
    total,
    amount: moneyToNumber(total),
  };

  // Core fields an order can't sensibly be auto-created without.
  parsed.ok = Boolean(parsed.orderNumber && parsed.guestName && parsed.eventDate);
  return parsed;
}

/**
 * Full item/total detail for catering_orders.notes: the notes column is the
 * durable record of what the email said (order items only reference menu
 * items that exist, so unmatched names would otherwise be lost).
 */
export function composeOrderNotes(parsed: ParsedCateringEmail, unmatchedItemNames: string[]): string {
  const parts: string[] = [];
  parts.push(`Auto-created from CFA order #${parsed.orderNumber ?? "unknown"} email.`);
  if (parsed.items.length > 0) {
    parts.push(
      "Items:\n" +
        parsed.items
          .map((i) => `- ${i.qty}x ${i.name}${i.price ? ` (${i.price})` : ""}`)
          .join("\n"),
    );
  }
  if (parsed.subtotal || parsed.tax || parsed.total) {
    parts.push(
      `Subtotal ${parsed.subtotal ?? "?"} | Tax ${parsed.tax ?? "?"} | Total ${parsed.total ?? "?"}`,
    );
  }
  if (parsed.specialInstructions) {
    parts.push(`Special instructions: ${parsed.specialInstructions}`);
  }
  if (unmatchedItemNames.length > 0) {
    parts.push(`Not in menu (add manually): ${unmatchedItemNames.join(", ")}`);
  }
  return parts.join("\n\n");
}

/**
 * Discord summary card. buildDiscordMessage (lib/discord/format.ts) posts the
 * payload's `message` string under the event's title/emoji, so this is the
 * whole card body.
 */
export function composeDiscordSummary(parsed: ParsedCateringEmail): string {
  if (!parsed.ok) {
    return [
      "NEEDS REVIEW: catering order email arrived but could not be fully parsed.",
      `Order #${parsed.orderNumber ?? "unknown"} — check the app's catering pipeline for the stub order and the raw email in its notes.`,
    ].join("\n");
  }
  const lines: string[] = [];
  const kind = parsed.fulfillment === "delivery" ? "Delivery" : "Pickup";
  lines.push(`${parsed.guestName} — ${kind} order #${parsed.orderNumber}`);
  lines.push(`${parsed.eventDate} at ${parsed.eventTime ?? "?"} | ${parsed.headcount ?? "?"} guests`);
  if (parsed.items.length > 0) {
    lines.push(parsed.items.map((i) => `${i.qty}x ${i.name}`).join("\n"));
  }
  const money: string[] = [];
  if (parsed.total) money.push(`Total ${parsed.total}`);
  if (parsed.paperGoods) money.push("Paper goods: yes");
  if (money.length > 0) lines.push(money.join(" | "));
  if (parsed.specialInstructions) lines.push(`Note: ${parsed.specialInstructions}`);
  return lines.join("\n");
}
