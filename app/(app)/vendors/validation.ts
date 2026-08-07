import { z } from "zod";

/**
 * Input validation for the Vendors server actions
 * (app/(app)/vendors/actions.ts). ARCHITECTURE.md "Vendors": "Directory:
 * vendor name, category, rep contact info, account number, website, notes."
 */

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

export const vendorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: optionalText,
  repName: optionalText,
  phone: optionalText,
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  accountNumber: optionalText,
  website: optionalText,
  notes: optionalText,
});
export type VendorInput = z.infer<typeof vendorSchema>;

export const updateVendorSchema = vendorSchema.extend({
  id: z.string().uuid(),
});
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const setVendorActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type SetVendorActiveInput = z.infer<typeof setVendorActiveSchema>;

export const deleteVendorSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteVendorInput = z.infer<typeof deleteVendorSchema>;
