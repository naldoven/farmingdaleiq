import { describe, expect, it } from "vitest";

import { logRecoverySchema, normalizeUsPhone, settingsSchema } from "@/app/(app)/guest-recovery/validation";

const MENU_ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const SUBMISSION_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const valid = {
  submissionId: SUBMISSION_ID,
  guestName: "  Nolan Patrick ",
  guestEmail: "Nolan@Example.com ",
  guestPhone: "(631) 555-0142",
  orderNumber: " 8407578 ",
  note: " Chicken sandwich missing, called at 8 PM ",
  smsConsent: true,
  reason: "missing_item",
  path: "standard",
  items: [{ menuItemId: MENU_ID, qty: 1 }],
};

describe("normalizeUsPhone", () => {
  it("turns common US formats into E.164", () => {
    expect(normalizeUsPhone("(631) 555-0142")).toBe("+16315550142");
    expect(normalizeUsPhone("631-555-0142")).toBe("+16315550142");
    expect(normalizeUsPhone("1 631 555 0142")).toBe("+16315550142");
    expect(normalizeUsPhone("+1 (631) 555-0142")).toBe("+16315550142");
  });

  it("rejects numbers that are not a US phone", () => {
    expect(normalizeUsPhone("555-0142")).toBeNull();
    expect(normalizeUsPhone("063 155 50142")).toBeNull();
    expect(normalizeUsPhone("+44 20 7946 0958")).toBeNull();
    expect(normalizeUsPhone("")).toBeNull();
    expect(normalizeUsPhone("call me")).toBeNull();
  });

  it("rejects an area code that starts with 0 or 1", () => {
    expect(normalizeUsPhone("131-555-0142")).toBeNull();
    expect(normalizeUsPhone("031-555-0142")).toBeNull();
  });
});

describe("logRecoverySchema reason and path", () => {
  it("needs a reason from the list", () => {
    for (const reason of ["missing_item", "wrong_item", "quality", "too_slow", "other"]) {
      expect(logRecoverySchema.safeParse({ ...valid, reason }).success, reason).toBe(true);
    }
    const missing = logRecoverySchema.safeParse({ ...valid, reason: undefined });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].message).toBe("Pick a reason");
    expect(logRecoverySchema.safeParse({ ...valid, reason: "late" }).success).toBe(false);
  });

  it("needs the path: with the app (spotlight) or without (standard)", () => {
    expect(logRecoverySchema.parse({ ...valid, path: "spotlight" }).path).toBe("spotlight");
    expect(logRecoverySchema.safeParse({ ...valid, path: undefined }).success).toBe(false);
    expect(logRecoverySchema.safeParse({ ...valid, path: "vip" }).success).toBe(false);
  });
});

describe("settingsSchema", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("keeps expiry between 7 and 365 whole days", () => {
    expect(settingsSchema.safeParse({ expiryDays: 90, overseerId: A, backupId: B }).success).toBe(true);
    expect(settingsSchema.safeParse({ expiryDays: 6, overseerId: A, backupId: B }).success).toBe(false);
    expect(settingsSchema.safeParse({ expiryDays: 366, overseerId: A, backupId: B }).success).toBe(false);
    expect(settingsSchema.safeParse({ expiryDays: 30.5, overseerId: A, backupId: B }).success).toBe(false);
  });

  it("lets the people be unset but never the same person twice", () => {
    expect(settingsSchema.safeParse({ expiryDays: 90, overseerId: null, backupId: null }).success).toBe(true);
    const same = settingsSchema.safeParse({ expiryDays: 90, overseerId: A, backupId: A });
    expect(same.success).toBe(false);
    if (!same.success) expect(same.error.issues[0].message).toMatch(/different person/i);
  });
});

describe("logRecoverySchema", () => {
  it("trims, lower-cases the email and normalizes the phone", () => {
    const parsed = logRecoverySchema.parse(valid);
    expect(parsed.guestName).toBe("Nolan Patrick");
    expect(parsed.guestEmail).toBe("nolan@example.com");
    expect(parsed.guestPhone).toBe("+16315550142");
    expect(parsed.orderNumber).toBe("8407578");
    expect(parsed.note).toBe("Chicken sandwich missing, called at 8 PM");
    expect(logRecoverySchema.parse({ ...valid, note: "" }).note).toBeNull();
  });

  it("requires the name, phone, email and order number; only the note can be left blank", () => {
    const cases: [Partial<typeof valid>, RegExp][] = [
      [{ guestName: " " }, /guest's name/i],
      [{ guestPhone: "" }, /phone number/i],
      [{ guestEmail: "" }, /email/i],
      [{ orderNumber: "  " }, /order number/i],
    ];
    for (const [override, message] of cases) {
      const result = logRecoverySchema.safeParse({ ...valid, ...override });
      expect(result.success, JSON.stringify(override)).toBe(false);
      if (!result.success) expect(result.error.issues.map((i) => i.message).join(" ")).toMatch(message);
    }
  });

  it("rejects a bad email and a bad phone with a plain message", () => {
    const email = logRecoverySchema.safeParse({ ...valid, guestEmail: "nolan@" });
    expect(email.success).toBe(false);
    const phone = logRecoverySchema.safeParse({ ...valid, guestPhone: "12345" });
    expect(phone.success).toBe(false);
    if (!phone.success) expect(phone.error.issues[0].message).toMatch(/10-digit/i);
  });

  it("needs at least one item and caps the list", () => {
    expect(logRecoverySchema.safeParse({ ...valid, items: [] }).success).toBe(false);
    const many = Array.from({ length: 21 }, () => ({ menuItemId: MENU_ID, qty: 1 }));
    expect(logRecoverySchema.safeParse({ ...valid, items: many }).success).toBe(false);
  });

  it("takes a menu item or a named other item, never neither", () => {
    expect(logRecoverySchema.safeParse({ ...valid, items: [{ name: "Peach milkshake", qty: 2 }] }).success).toBe(true);
    expect(logRecoverySchema.safeParse({ ...valid, items: [{ qty: 1 }] }).success).toBe(false);
    expect(logRecoverySchema.safeParse({ ...valid, items: [{ name: "   ", qty: 1 }] }).success).toBe(false);
  });

  it("keeps quantities between 1 and 20", () => {
    expect(logRecoverySchema.safeParse({ ...valid, items: [{ menuItemId: MENU_ID, qty: 0 }] }).success).toBe(false);
    expect(logRecoverySchema.safeParse({ ...valid, items: [{ menuItemId: MENU_ID, qty: 21 }] }).success).toBe(false);
    expect(logRecoverySchema.safeParse({ ...valid, items: [{ menuItemId: MENU_ID, qty: 1.5 }] }).success).toBe(false);
  });

  it("rejects a submission id that is not a uuid", () => {
    expect(logRecoverySchema.safeParse({ ...valid, submissionId: "abc" }).success).toBe(false);
  });

  it("keeps the text consent only as the leader set it, since a phone is always there now", () => {
    expect(logRecoverySchema.parse({ ...valid, smsConsent: false }).smsConsent).toBe(false);
    expect(logRecoverySchema.parse({ ...valid, smsConsent: true }).smsConsent).toBe(true);
  });
});
