import { describe, expect, it } from "vitest";

import {
  buildEmail,
  buildSms,
  buildSpotlightEmail,
  buildSpotlightSms,
  firstNameOf,
  formatItems,
  recoveryLink,
} from "@/lib/guest-recovery/messages";

const LINK = "https://app.example.com/recover/" + "a".repeat(64);
const items = [
  { name: "Medium Mac & Cheese", qty: 2 },
  { name: "Spicy Deluxe Sandwich", qty: 1 },
];
const base = { guestName: "Nolan Patrick", orderNumber: "8407578", items, link: LINK };

describe("formatItems", () => {
  it("shows a count only when it is more than one", () => {
    expect(formatItems(items)).toBe("2 x Medium Mac & Cheese, Spicy Deluxe Sandwich");
    expect(formatItems([{ name: "Cobb Salad", qty: 1 }])).toBe("Cobb Salad");
  });
});

describe("firstNameOf", () => {
  it("takes the first word and falls back to a friendly word", () => {
    expect(firstNameOf("  Nolan   Patrick ")).toBe("Nolan");
    expect(firstNameOf("   ")).toBe("there");
  });
});

describe("recoveryLink", () => {
  it("joins the base address and token without a double slash", () => {
    const token = "b".repeat(64);
    expect(recoveryLink("https://app.example.com/", token)).toBe(`https://app.example.com/recover/${token}`);
    expect(recoveryLink("https://app.example.com", token)).toBe(`https://app.example.com/recover/${token}`);
  });
});

describe("buildEmail", () => {
  it("names the guest, the order, the items and carries the link", () => {
    const email = buildEmail(base);
    expect(email.subject).toMatch(/Chick-fil-A Farmingdale order/);
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Nolan");
      expect(part).toContain("8407578");
      expect(part).toContain("Medium Mac &");
      expect(part).toContain(LINK);
      expect(part).toMatch(/receipt/i);
      expect(part).toMatch(/Chick-fil-A Farmingdale/);
    }
  });

  it("escapes anything the leader typed before it goes into html", () => {
    const email = buildEmail({
      ...base,
      guestName: "<script>alert(1)</script>",
      items: [{ name: "<img src=x onerror=1>", qty: 1 }],
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("works with no order number", () => {
    const email = buildEmail({ ...base, orderNumber: null });
    expect(email.text).toMatch(/recent order was missing/i);
    expect(email.text).not.toContain("#null");
  });

  it("references the inline QR image when asked to", () => {
    expect(buildEmail({ ...base, qrContentId: "recovery-qr" }).html).toContain('src="cid:recovery-qr"');
    expect(buildEmail(base).html).not.toContain("cid:");
  });

  it("follows the voice rules: no em dashes, no banned words", () => {
    const email = buildEmail(base);
    for (const part of [email.subject, email.html, email.text]) {
      expect(part).not.toContain("—");
      expect(part).not.toMatch(/\b(unlock|leverage|delve)\b/i);
    }
  });
});

describe("email look (red page, white card)", () => {
  it("says sorry first in the same words as the guest page, in both emails", () => {
    for (const email of [buildEmail(base), buildSpotlightEmail({ guestName: base.guestName, orderNumber: "8407578", items })]) {
      expect(email.html).toContain("We are sorry, Nolan. Let us make it right.");
      expect(email.html).toContain("background:#e51636");
      expect(email.html).toContain("My pleasure to serve you again.");
      expect(email.text).toContain("we are sorry about your order");
    }
  });

  it("puts the store phone number in the standard email when one is set", () => {
    expect(buildEmail(base).text).toContain("Reply to this email and the store will see it");
    const withPhone = buildEmail({ ...base, storePhone: "(631) 777-1926" });
    expect(withPhone.text).toContain("Call the store at (631) 777-1926");
    expect(withPhone.html).toContain("(631) 777-1926");
  });

  it("shows the white logo only when an address is given", () => {
    const url = "https://app.example.com/icons/cfa-mark-white.png";
    expect(buildEmail({ ...base, logoUrl: url }).html).toContain(`src="${url}"`);
    expect(buildSpotlightEmail({ guestName: "Nolan", orderNumber: null, items, logoUrl: url }).html).toContain(`src="${url}"`);
    expect(buildEmail(base).html).not.toContain("cfa-mark");
  });

  it("lists each item on its own line in the item box", () => {
    expect(buildEmail(base).html).toContain("2 x Medium Mac &amp; Cheese<br>Spicy Deluxe Sandwich");
    expect(buildSpotlightEmail({ guestName: "Nolan", orderNumber: null, items }).html).toContain(
      "2 x Medium Mac &amp; Cheese<br>Spicy Deluxe Sandwich",
    );
  });

  it("opens the standard text with the same apology as the email", () => {
    expect(buildSms(base)).toContain("we are sorry about your order");
    expect(buildSms(base)).not.toMatch(/thanks for telling us/);
  });

  it("keeps the code button and the plain link", () => {
    const email = buildEmail(base);
    expect(email.html).toContain("Show my code");
    expect(email.html).toContain(`href="${LINK}"`);
  });
});

describe("buildSms", () => {
  it("names the store, the items, the link and how to opt out", () => {
    const sms = buildSms(base);
    expect(sms).toContain("Chick-fil-A Farmingdale");
    expect(sms).toContain("Nolan");
    expect(sms).toContain("2 x Medium Mac & Cheese");
    expect(sms).toContain(LINK);
    expect(sms).toMatch(/Reply STOP to opt out/);
    expect(sms).not.toContain("—");
  });

  it("stays a reasonable length even with a long list", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Item number ${i} with a long name`, qty: 1 }));
    expect(buildSms({ ...base, items: many }).length).toBeLessThanOrEqual(480);
  });
});

describe("expiry line", () => {
  it("tells the guest how long the code is good for, in the email, the text and the page-ready copy", () => {
    const withDate = { ...base, goodUntil: "Good until Feb 1, 2027" };
    expect(buildEmail(withDate).text).toContain("Good until Feb 1, 2027");
    expect(buildEmail(withDate).html).toContain("Good until Feb 1, 2027");
    expect(buildSms(withDate)).toContain("Good until Feb 1, 2027");
  });

  it("leaves it out when no date is given", () => {
    expect(buildEmail(base).text).not.toMatch(/Good until/);
  });

  it("keeps the text under the length cap with a long list and a date", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Item number ${i} with a long name`, qty: 1 }));
    expect(buildSms({ ...base, items: many, goodUntil: "Good until Feb 1, 2027" }).length).toBeLessThanOrEqual(480);
  });
});

describe("Spotlight messages (guest has the Chick-fil-A app)", () => {
  const spot = { guestName: "Nolan Patrick", orderNumber: "8407578", items };

  it("promise a reward within 48 hours, name the items and order, and carry no link or QR", () => {
    const email = buildSpotlightEmail(spot);
    const sms = buildSpotlightSms(spot);
    for (const part of [email.text, email.html, sms]) {
      expect(part).toContain("Nolan");
      expect(part).toMatch(/within 48 hours/);
      expect(part).not.toMatch(/https?:\/\//);
      expect(part).not.toContain("cid:");
    }
    expect(email.text).toContain("8407578");
    expect(email.text).toContain("2 x Medium Mac & Cheese");
    expect(email.html).not.toContain("<img");
    expect(sms).toMatch(/Reply STOP to opt out/);
    expect(sms).toContain("Chick-fil-A Farmingdale");
  });

  it("escape what the leader typed", () => {
    const email = buildSpotlightEmail({ ...spot, guestName: "<script>x</script>", items: [{ name: "<b>y</b>", qty: 1 }] });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>y</b>");
  });

  it("follow the voice rules", () => {
    const email = buildSpotlightEmail(spot);
    for (const part of [email.subject, email.html, email.text, buildSpotlightSms(spot)]) {
      expect(part).not.toContain("\u2014");
      expect(part).not.toMatch(/\b(unlock|leverage|delve)\b/i);
    }
  });

  it("keep the text short even with a long list", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Item number ${i} with a long name`, qty: 1 }));
    expect(buildSpotlightSms({ ...spot, items: many }).length).toBeLessThanOrEqual(480);
    expect(buildSpotlightSms({ ...spot, items: many, storePhone: "631-555-0100" }).length).toBeLessThanOrEqual(480);
  });

  it("apologize first, say where the reward shows up and how it is used", () => {
    const email = buildSpotlightEmail(spot);
    expect(email.text).toMatch(/we are sorry about your order/i);
    expect(email.text).toContain("Chick-fil-A One account");
    expect(email.text).toContain("tap Rewards");
    expect(email.text).toMatch(/applies on its own/);
    expect(email.text).toMatch(/Chick-fil-A will email you/);
    expect(buildSpotlightSms(spot)).toMatch(/under Rewards/);
  });

  it("say how long the reward is good for only when a date is given", () => {
    const withDate = { ...spot, goodUntil: "Good until Feb 1, 2027" };
    expect(buildSpotlightEmail(withDate).text).toContain("Good until Feb 1, 2027.");
    expect(buildSpotlightEmail(withDate).html).toContain("Good until Feb 1, 2027.");
    expect(buildSpotlightSms(withDate)).toContain("Good until Feb 1, 2027.");
    expect(buildSpotlightEmail(spot).text).not.toMatch(/Good until/);
    expect(buildSpotlightSms(spot)).not.toMatch(/Good until/);
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Item number ${i} with a long name`, qty: 1 }));
    expect(buildSpotlightSms({ ...withDate, items: many, storePhone: "(631) 777-1926" }).length).toBeLessThanOrEqual(480);
  });

  it("show the store phone number only when one is set", () => {
    expect(buildSpotlightEmail(spot).text).toContain("Reply to this email and the store will see it");
    expect(buildSpotlightEmail(spot).text).not.toMatch(/Call the store/);
    expect(buildSpotlightSms(spot)).not.toMatch(/Call /);

    const withPhone = { ...spot, storePhone: "631-555-0100" };
    expect(buildSpotlightEmail(withPhone).text).toContain("Call the store at 631-555-0100");
    expect(buildSpotlightEmail(withPhone).html).toContain("631-555-0100");
    expect(buildSpotlightSms(withPhone)).toContain("Call 631-555-0100");
  });
});
