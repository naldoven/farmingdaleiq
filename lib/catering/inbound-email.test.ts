import { describe, expect, it } from "vitest";

import {
  composeDiscordSummary,
  composeOrderNotes,
  parseCateringEmail,
} from "./inbound-email";

/**
 * Fixture: the real CFA catering order email (order 04093, 2026-07-10),
 * as Gmail's getPlainBody() delivers it -- quoted-printable already decoded,
 * wrapped in the Outlook forward header block. Guest PII is the real sample
 * Naldo provided for parser development.
 */
const SUBJECT = "Fw: Incoming Catering Order: Pickup Order Received for (04093)";
const BODY = `

Get Outlook for iOS<https://aka.ms/o0ukef>
________________________________
From: Chick-fil-A <one@email.chick-fil-a.com>
Sent: Thursday, July 9, 2026 2:04 PM
To: Farmingdale FSU <Farmingdale.FSU@chick-fil-a.com>
Subject: Incoming Catering Order: Pickup Order Received for (04093)

Catering Pickup Order for 04093
Pickup Time
Friday 7/10/2026 at 11:00am
Customer Information
Marissa Cancellieri
+16313358148
surfers117@hotmail.com
Guest Count:  125
Paper Goods:  No
Special Instructions
lots of napkins
Item Name
Quantity
Price
Regular 8 ct Chick-fil-A® Nuggets Packaged Meal
125
$10.83
8 ct Chick-fil-A® Nuggets
1
Original Flavor Waffle Potato Chips
1
Chocolate Chunk Cookie
1
Subtotal
$1353.75
Tax
$118.45
Total
$1472.20
`;

describe("parseCateringEmail", () => {
  const parsed = parseCateringEmail({ subject: SUBJECT, body: BODY });

  it("extracts the order number from the subject", () => {
    expect(parsed.orderNumber).toBe("04093");
  });

  it("detects pickup fulfillment", () => {
    expect(parsed.fulfillment).toBe("pickup");
  });

  it("parses the event date and time", () => {
    expect(parsed.eventDate).toBe("2026-07-10");
    expect(parsed.eventTime).toBe("11:00");
  });

  it("parses the customer block", () => {
    expect(parsed.guestName).toBe("Marissa Cancellieri");
    expect(parsed.phone).toBe("+16313358148");
    expect(parsed.email).toBe("surfers117@hotmail.com");
  });

  it("parses headcount and paper goods", () => {
    expect(parsed.headcount).toBe(125);
    expect(parsed.paperGoods).toBe(false);
  });

  it("parses special instructions", () => {
    expect(parsed.specialInstructions).toBe("lots of napkins");
  });

  it("parses the item rows with quantities and optional prices", () => {
    expect(parsed.items).toEqual([
      { name: "Regular 8 ct Chick-fil-A® Nuggets Packaged Meal", qty: 125, price: "$10.83" },
      { name: "8 ct Chick-fil-A® Nuggets", qty: 1, price: null },
      { name: "Original Flavor Waffle Potato Chips", qty: 1, price: null },
      { name: "Chocolate Chunk Cookie", qty: 1, price: null },
    ]);
  });

  it("parses money totals; total drives the order amount", () => {
    expect(parsed.subtotal).toBe("$1353.75");
    expect(parsed.tax).toBe("$118.45");
    expect(parsed.total).toBe("$1472.20");
    expect(parsed.amount).toBe(1472.2);
  });

  it("is a complete parse (ok = true)", () => {
    expect(parsed.ok).toBe(true);
  });

  it("afternoon times convert to 24h", () => {
    const p = parseCateringEmail({
      subject: "Incoming Catering Order: Delivery Order Received for (00007)",
      body: "Catering Delivery Order for 00007\nDelivery Time\nMonday 12/1/2026 at 4:30pm\nCustomer Information\nJoe Test\nGuest Count: 10\nSubtotal\n$1.00\nTax\n$0.00\nTotal\n$1.00\n",
    });
    expect(p.fulfillment).toBe("delivery");
    expect(p.eventDate).toBe("2026-12-01");
    expect(p.eventTime).toBe("16:30");
    expect(p.headcount).toBe(10);
  });

  it("12:xx pm stays 12, 12:xx am becomes 00", () => {
    const noon = parseCateringEmail({
      subject: "s",
      body: "Pickup Time\nFri 7/10/2026 at 12:15pm\n",
    });
    expect(noon.eventTime).toBe("12:15");
    const midnight = parseCateringEmail({
      subject: "s",
      body: "Pickup Time\nFri 7/10/2026 at 12:15am\n",
    });
    expect(midnight.eventTime).toBe("00:15");
  });

  it("a garbage email is an incomplete parse, never a throw", () => {
    const p = parseCateringEmail({ subject: "hello", body: "not an order at all" });
    expect(p.ok).toBe(false);
    expect(p.orderNumber).toBeNull();
    expect(p.guestName).toBeNull();
    expect(p.amount).toBeNull();
  });

  it("missing items table still parses the rest (ok if core fields present)", () => {
    const p = parseCateringEmail({
      subject: "Incoming Catering Order: Pickup Order Received for (01234)",
      body: "Pickup Time\nFriday 7/10/2026 at 9:00am\nCustomer Information\nJane Doe\nGuest Count: 5\nTotal\n$50.00\n",
    });
    expect(p.ok).toBe(true);
    expect(p.items).toEqual([]);
    expect(p.amount).toBe(50);
  });
});

describe("composeOrderNotes", () => {
  it("captures order number, items with prices, totals, instructions, and unmatched flags", () => {
    const parsed = parseCateringEmail({ subject: SUBJECT, body: BODY });
    const notes = composeOrderNotes(parsed, ["Chocolate Chunk Cookie"]);
    expect(notes).toContain("CFA order #04093");
    expect(notes).toContain("125x Regular 8 ct Chick-fil-A® Nuggets Packaged Meal ($10.83)");
    expect(notes).toContain("Subtotal $1353.75 | Tax $118.45 | Total $1472.20");
    expect(notes).toContain("Special instructions: lots of napkins");
    expect(notes).toContain("Not in menu (add manually): Chocolate Chunk Cookie");
  });
});

describe("composeDiscordSummary", () => {
  it("builds the full summary card", () => {
    const parsed = parseCateringEmail({ subject: SUBJECT, body: BODY });
    const message = composeDiscordSummary(parsed);
    expect(message).toContain("Marissa Cancellieri");
    expect(message).toContain("#04093");
    expect(message).toContain("Pickup");
    expect(message).toContain("2026-07-10 at 11:00");
    expect(message).toContain("125 guests");
    expect(message).toContain("Total $1472.20");
    expect(message).toContain("125x Regular 8 ct Chick-fil-A® Nuggets Packaged Meal");
  });

  it("flags incomplete parses for review", () => {
    const parsed = parseCateringEmail({ subject: "weird", body: "garbage" });
    expect(composeDiscordSummary(parsed)).toContain("NEEDS REVIEW");
  });
});
