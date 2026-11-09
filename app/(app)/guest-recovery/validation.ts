import { z } from "zod";

import {
  GUEST_NAME_MAX,
  ITEM_NAME_MAX,
  MAX_EXPIRY_DAYS,
  MAX_ITEMS,
  MAX_MODS,
  MAX_QTY,
  MIN_EXPIRY_DAYS,
  MOD_NAME_MAX,
  MOD_NOTE_MAX,
  NOTE_MAX,
  ORDER_NUMBER_MAX,
  PATHS,
  REASONS,
} from "@/app/(app)/guest-recovery/constants";
import { deriveFaultSource } from "@/lib/guest-recovery/mods";

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

/** One removal or addition ("Pickles", "Extra sauce"). Repeats collapse, whatever the capitalization. */
const modListSchema = z
  .array(z.string().trim().min(1).max(MOD_NAME_MAX, "That change is too long"))
  .max(MAX_MODS, `Up to ${MAX_MODS} changes per item`)
  .default([])
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const itemSchema = z
  .object({
    menuItemId: z.uuid("That menu item is not valid").nullish(),
    name: z.string().trim().max(ITEM_NAME_MAX, "That item name is too long").optional(),
    qty: z
      .number()
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(MAX_QTY, `Quantity can be up to ${MAX_QTY}`),
    removed: modListSchema,
    added: modListSchema,
    modNote: z
      .string()
      .trim()
      .max(MOD_NOTE_MAX, `That note is too long (up to ${MOD_NOTE_MAX} characters)`)
      .nullish()
      .transform((value) => (value ? value : null)),
    // Did the receipt or sticker show what the guest ordered? Did the item match it? Null = not answered.
    receiptOk: z.boolean().nullish(),
    itemOk: z.boolean().nullish(),
  })
  .superRefine((item, ctx) => {
    if (!item.menuItemId && !item.name) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Pick an item or name the missing item" });
    }
    // A free-text "other" item has no ingredient list to remove from or add to.
    if (!item.menuItemId && (item.removed.length > 0 || item.added.length > 0)) {
      ctx.addIssue({ code: "custom", path: ["removed"], message: "Changes only work on items from the menu" });
    }
  })
  .transform((item) => {
    const receiptOk = item.receiptOk ?? null;
    const itemOk = item.itemOk ?? null;
    const answered = receiptOk !== null || itemOk !== null;
    return {
      menuItemId: item.menuItemId ?? null,
      // A menu item takes its name from the menu row on the server; only an
      // "other" line carries a name from the client.
      name: item.menuItemId ? null : (item.name ?? null),
      qty: item.qty,
      removed: item.removed,
      added: item.added,
      modNote: item.modNote,
      receiptOk,
      itemOk,
      // The source is worked out here, never taken from the client.
      faultSource: answered ? deriveFaultSource(receiptOk, itemOk) : null,
    };
  });

export const logRecoverySchema = z
  .object({
    submissionId: z.uuid("Something went wrong with the form. Reload and try again."),
    guestName: z.string().trim().min(1, "Enter the guest's name").max(GUEST_NAME_MAX, "That name is too long"),
    guestEmail: z.string().trim().min(1, "Enter the guest's email").max(254, "That email is too long"),
    guestPhone: z.string().trim().min(1, "Enter the guest's phone number").max(30, "That phone number is too long"),
    orderNumber: z
      .string()
      .trim()
      .min(1, "Enter the order number")
      .max(ORDER_NUMBER_MAX, `The order number is too long (up to ${ORDER_NUMBER_MAX} characters)`),
    note: z
      .string()
      .trim()
      .max(NOTE_MAX, `That is too long (up to ${NOTE_MAX} characters)`)
      .optional()
      .transform((value) => (value ? value : null)),
    smsConsent: z.boolean().default(false),
    reason: z.enum(REASONS, { message: "Pick a reason" }),
    path: z.enum(PATHS, { message: "Pick whether the guest has the Chick-fil-A app" }),
    items: z.array(itemSchema).min(1, "Pick at least one missing item").max(MAX_ITEMS, `Up to ${MAX_ITEMS} items`),
  })
  .superRefine((value, ctx) => {
    if (value.guestEmail && !z.email().safeParse(value.guestEmail).success) {
      ctx.addIssue({ code: "custom", path: ["guestEmail"], message: "That email does not look right" });
    }
    if (value.guestPhone && !normalizeUsPhone(value.guestPhone)) {
      ctx.addIssue({ code: "custom", path: ["guestPhone"], message: "Enter a 10-digit US phone number" });
    }
  })
  .transform((value) => {
    return {
      submissionId: value.submissionId,
      guestName: value.guestName,
      guestEmail: value.guestEmail.toLowerCase(),
      // superRefine already proved the phone normalizes.
      guestPhone: normalizeUsPhone(value.guestPhone) as string,
      orderNumber: value.orderNumber,
      note: value.note,
      smsConsent: value.smsConsent,
      reason: value.reason,
      path: value.path,
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

export const assignSchema = z.object({
  id: z.uuid("That recovery is not valid"),
  assigneeId: z.uuid("Pick who to hand it to"),
});

export const settingsSchema = z
  .object({
    expiryDays: z
      .number()
      .int("Use a whole number of days")
      .min(MIN_EXPIRY_DAYS, `At least ${MIN_EXPIRY_DAYS} days`)
      .max(MAX_EXPIRY_DAYS, `At most ${MAX_EXPIRY_DAYS} days`),
    overseerId: z.uuid("Pick the overseer").nullable(),
    backupId: z.uuid("Pick the backup").nullable(),
    // Shown to app guests as the number to call. Blank clears it.
    storePhone: z
      .string()
      .trim()
      .max(30, "That number is too long")
      .regex(/^[0-9()+.\s-]*$/, "Use digits, spaces, dashes and parentheses")
      .refine((v) => v === "" || v.replace(/\D/g, "").length >= 7, "Enter the full phone number")
      .transform((v) => (v === "" ? null : v))
      .default(null),
  })
  .superRefine((value, ctx) => {
    if (value.overseerId && value.overseerId === value.backupId) {
      ctx.addIssue({ code: "custom", path: ["backupId"], message: "The backup must be a different person" });
    }
  });
