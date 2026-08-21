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
  deleteVendorSchema,
  setVendorActiveSchema,
  updateVendorSchema,
  vendorSchema,
  type DeleteVendorInput,
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
    website: parsed.website ?? null,
    notes: parsed.notes ?? null,
  };
}

const VENDOR_LINKED_RECORD_MESSAGE =
  "This vendor is attached to old records. Deactivate it instead.";

function isForeignKeyError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23503" || error?.message?.toLowerCase().includes("foreign key");
}

async function vendorHasLinkedRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendorId: string,
) {
  const checks = await Promise.all([
    supabase.from("equipment").select("id").eq("service_vendor_id", vendorId).limit(1),
    supabase.from("pm_schedules").select("id").eq("vendor_id", vendorId).limit(1),
    supabase.from("work_orders").select("id").eq("vendor_id", vendorId).limit(1),
    supabase.from("training_courses").select("id").eq("vendor_id", vendorId).limit(1),
  ]);
  const error = checks.find((check) => check.error)?.error;
  if (error) return { hasLinkedRecords: false, error };

  return {
    hasLinkedRecords: checks.some((check) => (check.data ?? []).length > 0),
    error: null,
  };
}

export async function createVendor(
  input: VendorInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("vendors.view");
    const parsed = vendorSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("vendors")
      .insert(vendorColumns(parsed))
      .select("id")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? "Could not create the vendor.",
      };
    }

    revalidatePath("/vendors");
    revalidatePath("/vendors-settings");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateVendor(
  input: UpdateVendorInput,
): Promise<ActionResult> {
  try {
    await requirePermission("vendors.view");
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
    revalidatePath("/vendors-settings");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Deactivation is the normal path for a vendor that is no longer used but has
 * history. Hard deletes are guarded below for vendors that were created by
 * mistake and have no dependent records.
 */
export async function setVendorActive(
  input: SetVendorActiveInput,
): Promise<ActionResult> {
  try {
    await requirePermission("vendors.view");
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
    revalidatePath("/vendors-settings");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteVendor(
  input: DeleteVendorInput,
): Promise<ActionResult> {
  try {
    await requirePermission("vendors.view");
    const parsed = deleteVendorSchema.parse(input);
    const supabase = await createClient();

    const linked = await vendorHasLinkedRecords(supabase, parsed.id);
    if (linked.error) {
      return { ok: false, error: linked.error.message };
    }
    if (linked.hasLinkedRecords) {
      return { ok: false, error: VENDOR_LINKED_RECORD_MESSAGE };
    }

    const { data, error } = await supabase
      .from("vendors")
      .delete()
      .eq("id", parsed.id)
      .select("id");

    if (isForeignKeyError(error)) {
      return { ok: false, error: VENDOR_LINKED_RECORD_MESSAGE };
    }
    if (error) {
      return { ok: false, error: error.message };
    }
    if ((data ?? []).length === 0) {
      return { ok: false, error: "That vendor no longer exists." };
    }

    revalidatePath("/vendors");
    revalidatePath("/vendors-settings");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
