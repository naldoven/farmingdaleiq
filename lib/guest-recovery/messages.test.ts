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
  });
});
