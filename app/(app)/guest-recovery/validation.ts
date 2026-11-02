import { z } from "zod";

import {
  GUEST_NAME_MAX,
  ITEM_NAME_MAX,
  MAX_ITEMS,
  MAX_QTY,
  NOTE_MAX,
  ORDER_NUMBER_MAX,
} from "@/app/(app)/guest-recovery/constants";

/**
 * Input validation for Guest Recovery actions. No "use server" so it is
 * testable without the server runtime. The limits mirror the table check
 * constraints in 20261102000000_guest_recovery.sql, so a bad value fails with
 * a friendly message here before Postgres rejects it with a raw one.
 */

/**
 * Turns a US phone typed any usual way into E.164 (+1XXXXXXXXXX), or null when
 * it is not a real US number. The area code cannot start with 0 or 1, which
 * is also what the guest_phone check constraint enforces.
 */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^[2-9][0-9]{9}$/.test(national)) return null;
  return `+1${national}`;
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (up to ${max} characters)`)
    .optional()
    .transform((value) => (value ? value : null));

const itemSchema = z
  .object({
    menuItemId: z.uuid("That menu item is not valid").nullish(),
    name: z.string().trim().max(ITEM_NAME_MAX, "That item name is too long").optional(),
    qty: z
      .number()
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(MAX_QTY, `Quantity can be up to ${MAX_QTY}`),
  })
  .superRefine((item, ctx) => {
    if (!item.menuItemId && !item.name) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Pick an item or name the missing item" });
    }
  })
  .transform((item) => ({
    menuItemId: item.menuItemId ?? null,
    // A menu item takes its name from the menu row on the server; only an
    // "other" line carries a name from the client.
    name: item.menuItemId ? null : (item.name ?? null),
    qty: item.qty,
  }));

export const logRecoverySchema = z
  .object({
    submissionId: z.uuid("Something went wrong with the form. Reload and try again."),
    guestName: z.string().trim().min(1, "Enter the guest's name").max(GUEST_NAME_MAX, "That name is too long"),
    guestEmail: z.string().trim().max(254, "That email is too long").optional(),
    guestPhone: z.string().trim().max(30, "That phone number is too long").optional(),
    orderNumber: optionalText(ORDER_NUMBER_MAX, "The order number"),
    note: optionalText(NOTE_MAX, "The note"),
    smsConsent: z.boolean().default(false),
    items: z.array(itemSchema).min(1, "Pick at least one missing item").max(MAX_ITEMS, `Up to ${MAX_ITEMS} items`),
  })
  .superRefine((value, ctx) => {
    const email = value.guestEmail ?? "";
    const phone = value.guestPhone ?? "";
    if (!email && !phone) {
      ctx.addIssue({ code: "custom", path: ["guestEmail"], message: "Enter an email or a phone number" });
    }
    if (email && !z.email().safeParse(email).success) {
      ctx.addIssue({ code: "custom", path: ["guestEmail"], message: "That email does not look right" });
    }
    if (phone && !normalizeUsPhone(phone)) {
      ctx.addIssue({ code: "custom", path: ["guestPhone"], message: "Enter a 10-digit US phone number" });
    }
  })
  .transform((value) => {
    const guestPhone = value.guestPhone ? normalizeUsPhone(value.guestPhone) : null;
    return {
      submissionId: value.submissionId,
      guestName: value.guestName,
      guestEmail: value.guestEmail ? value.guestEmail.toLowerCase() : null,
      guestPhone,
      orderNumber: value.orderNumber,
      note: value.note,
      // Consent to text means nothing without a number to text.
      smsConsent: Boolean(guestPhone) && value.smsConsent,
      items: value.items,
    };
  });

export type LogRecoveryInput = z.input<typeof logRecoverySchema>;
export type LogRecoveryParsed = z.output<typeof logRecoverySchema>;

export const recoveryIdSchema = z.object({ id: z.uuid("That recovery is not valid") });

export const menuItemInputSchema = z.object({
  name: z.string().trim().min(1, "Name the item").max(ITEM_NAME_MAX, "That name is too long"),
  family: z.string().trim().min(1, "Name the group").max(ITEM_NAME_MAX, "That group name is too long"),
  category: z.string().trim().min(1, "Pick a category").max(40, "That category name is too long"),
});
