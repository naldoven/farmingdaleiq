"use server";

/**
 * Server actions for the Equipment registry + PM schedules
 * (ARCHITECTURE.md "Equipment registry", "Preventive maintenance"). All
 * writes here are maintenance.manage-gated — the equipment registry and its
 * PM schedules are leader/admin configuration, not day-to-day self-service
 * (that self-service lives in app/(app)/maintenance/actions.ts's
 * updateWorkOrderStatus/completeWorkOrder for assignees).
 */

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/maintenance/action-types";
import { closeOpenDowntimeSpan, openDowntimeSpan } from "@/app/(app)/maintenance/downtime";
import { addDays } from "@/app/(app)/maintenance/logic";
import {
  addEquipmentFileSchema,
  equipmentSchema,
  pmScheduleSchema,
  setEquipmentStatusSchema,
  setPmScheduleActiveSchema,
  updateEquipmentSchema,
  updatePmScheduleSchema,
  type AddEquipmentFileInput,
  type EquipmentInput,
  type PmScheduleInput,
  type SetEquipmentStatusInput,
  type SetPmScheduleActiveInput,
  type UpdateEquipmentInput,
  type UpdatePmScheduleInput,
} from "@/app/(app)/maintenance/equipment/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function revalidateEquipment(equipmentId?: string) {
  revalidatePath("/maintenance/equipment");
  if (equipmentId) revalidatePath(`/maintenance/equipment/${equipmentId}`);
}

function equipmentColumns(parsed: EquipmentInput) {
  return {
    name: parsed.name,
    category: parsed.category ?? null,
    area: parsed.area ?? null,
    model: parsed.model ?? null,
    serial: parsed.serial ?? null,
    service_vendor_id: parsed.serviceVendorId ?? null,
    installed_on: parsed.installedOn ?? null,
    warranty_expires_on: parsed.warrantyExpiresOn ?? null,
    photo_url: parsed.photoUrl ?? null,
    notes: parsed.notes ?? null,
  };
}

export async function createEquipment(input: EquipmentInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("maintenance.manage");
    const parsed = equipmentSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("equipment")
      .insert(equipmentColumns(parsed))
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the equipment record." };
    }

    revalidateEquipment();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateEquipment(input: UpdateEquipmentInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.manage");
    const parsed = updateEquipmentSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("equipment")
      .update(equipmentColumns(parsed))
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateEquipment(parsed.id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Manual operational/down toggle (ARCHITECTURE.md "Equipment registry":
 * "Equipment can be marked down / operational; downtime spans are recorded
 * from work orders"). Idempotent both ways via the shared downtime helpers
 * (openDowntimeSpan/closeOpenDowntimeSpan no-op when there's nothing to do).
 */
export async function setEquipmentStatus(input: SetEquipmentStatusInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.manage");
    const parsed = setEquipmentStatusSchema.parse(input);
    const supabase = await createClient();

    if (parsed.status === "down") {
      await openDowntimeSpan(supabase, parsed.equipmentId, parsed.workOrderId);
    } else {
      await closeOpenDowntimeSpan(supabase, parsed.equipmentId);
    }

    revalidateEquipment(parsed.equipmentId);
    revalidatePath("/maintenance");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function addEquipmentFile(input: AddEquipmentFileInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.manage");
    const parsed = addEquipmentFileSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("equipment_files").insert({
      equipment_id: parsed.equipmentId,
      file_url: parsed.fileUrl,
      label: parsed.label ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateEquipment(parsed.equipmentId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

function pmScheduleColumns(parsed: PmScheduleInput) {
  return {
    equipment_id: parsed.equipmentId,
    title: parsed.title,
    description: parsed.description ?? null,
    interval_days: parsed.intervalDays,
    lead_days: parsed.leadDays,
    next_due_on: parsed.nextDueOn ?? null,
    checklist_template_id: parsed.checklistTemplateId ?? null,
    assign_user_id: parsed.assignUserId ?? null,
    vendor_id: parsed.vendorId ?? null,
    priority: parsed.priority ?? null,
    active: parsed.active,
  };
}

/**
 * next_due_on defaults to today + interval_days when not supplied, so a
 * freshly created schedule has a sensible first due date instead of NULL
 * (which app/api/cron/maintenance/route.ts treats as "never due").
 */
export async function createPmSchedule(
  input: PmScheduleInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("maintenance.manage");
    const parsed = pmScheduleSchema.parse(input);
    const supabase = await createClient();

    const nextDueOn = parsed.nextDueOn ?? addDays(new Date().toISOString().slice(0, 10), parsed.intervalDays);

    const { data, error } = await supabase
      .from("pm_schedules")
      .insert({ ...pmScheduleColumns(parsed), next_due_on: nextDueOn })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the PM schedule." };
    }

    revalidateEquipment(parsed.equipmentId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updatePmSchedule(input: UpdatePmScheduleInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.manage");
    const parsed = updatePmScheduleSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("pm_schedules")
      .update(pmScheduleColumns(parsed))
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateEquipment(parsed.equipmentId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function setPmScheduleActive(input: SetPmScheduleActiveInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.manage");
    const parsed = setPmScheduleActiveSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("pm_schedules")
      .update({ active: parsed.active })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/maintenance/equipment");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
