import { describe, expect, it } from "vitest";

import { logRecoverySchema, normalizeUsPhone } from "@/app/(app)/guest-recovery/validation";

const MENU_ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const SUBMISSION_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const valid = {
  submissionId: SUBMISSION_ID,
  guestName: "  Nolan Patrick ",
  guestEmail: "Nolan@Example.com ",
  guestPhone: "(631) 555-0142",
  orderNumber: " 8407578 ",
  note: "",
  smsConsent: true,
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

describe("logRecoverySchema", () => {
  it("trims, lower-cases the email and normalizes the phone", () => {
    const parsed = logRecoverySchema.parse(valid);
    expect(parsed.guestName).toBe("Nolan Patrick");
    expect(parsed.guestEmail).toBe("nolan@example.com");
    expect(parsed.guestPhone).toBe("+16315550142");
    expect(parsed.orderNumber).toBe("8407578");
    expect(parsed.note).toBeNull();
  });

  it("accepts email only or phone only, but not neither", () => {
    expect(logRecoverySchema.safeParse({ ...valid, guestPhone: "", smsConsent: false }).success).toBe(true);
    expect(logRecoverySchema.safeParse({ ...valid, guestEmail: "" }).success).toBe(true);
    const neither = logRecoverySchema.safeParse({ ...valid, guestEmail: "", guestPhone: "" });
    expect(neither.success).toBe(false);
    if (!neither.success) expect(neither.error.issues[0].message).toMatch(/email or a phone/i);
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

  it("only treats the text consent as given when a phone is there", () => {
    const parsed = logRecoverySchema.parse({ ...valid, guestPhone: "", smsConsent: true });
    expect(parsed.smsConsent).toBe(false);
  });
});
