import { z } from "zod";

/**
 * Input validation for the Vendors server actions
 * (app/(app)/vendors/actions.ts). ARCHITECTURE.md "Vendors": "Directory:
 * vendor name, category, rep contact info, account number, delivery days,
 * notes."
 */

const optionalText = z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : undefined));

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export { DAYS_OF_WEEK };

export const vendorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: optionalText,
  repName: optionalText,
  phone: optionalText,
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  accountNumber: optionalText,
  deliveryDays: z.array(z.enum(DAYS_OF_WEEK)).optional().default([]),
  website: optionalText,
  notes: optionalText,
});
export type VendorInput = z.infer<typeof vendorSchema>;

export const updateVendorSchema = vendorSchema.extend({ id: z.string().uuid() });
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const setVendorActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type SetVendorActiveInput = z.infer<typeof setVendorActiveSchema>;
