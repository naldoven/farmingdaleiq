"use server";

/**
 * Server actions for the Vendors directory (ARCHITECTURE.md "Vendors": "Read
 * access for everyone; manage access gated by permission"). Follows the
 * pattern documented in app/(app)/people/actions.ts.
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/vendors/action-types";
import {
  setVendorActiveSchema,
  updateVendorSchema,
  vendorSchema,
  type SetVendorActiveInput,
  type UpdateVendorInput,
  type VendorInput,
} from "@/app/(app)/vendors/validation";

function vendorColumns(parsed: VendorInput) {
  return {
    name: parsed.name,
    category: parsed.category ?? null,
    rep_name: parsed.repName ?? null,
    phone: parsed.phone ?? null,
    email: parsed.email ?? null,
    account_number: parsed.accountNumber ?? null,
    delivery_days: parsed.deliveryDays.length > 0 ? parsed.deliveryDays : null,
    website: parsed.website ?? null,
    notes: parsed.notes ?? null,
  };
}

export async function createVendor(input: VendorInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("vendors.manage");
    const parsed = vendorSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("vendors")
      .insert(vendorColumns(parsed))
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the vendor." };
    }

    revalidatePath("/vendors");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateVendor(input: UpdateVendorInput): Promise<ActionResult> {
  try {
    await requirePermission("vendors.manage");
    const parsed = updateVendorSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("vendors")
      .update(vendorColumns(parsed))
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/vendors");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Vendors are soft-deleted (active flag) rather than hard-deleted: work
 * orders, equipment, and pm_schedules can all reference a vendor_id, so
 * removing the row outright would either cascade-delete history or fail on
 * the FK. Deactivating just hides it from active pickers.
 */
export async function setVendorActive(input: SetVendorActiveInput): Promise<ActionResult> {
  try {
    await requirePermission("vendors.manage");
    const parsed = setVendorActiveSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("vendors")
      .update({ active: parsed.active })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/vendors");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
