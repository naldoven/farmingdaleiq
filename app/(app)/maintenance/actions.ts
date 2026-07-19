"use server";

/**
 * Server actions for Maintenance requests + work orders (ARCHITECTURE.md
 * "Maintenance (modeled on UpKeep)"). Follows the permission-guard pattern
 * documented in app/(app)/people/actions.ts:
 * 1. requirePermission(<key>) first, before any DB call.
 * 2. Mutations go through the per-request client (createClient()), so RLS
 *    (supabase/migrations/<ts>_vendors_maintenance_rls.sql) independently
 *    re-checks the same rule.
 * 3. Discriminated ActionResult return type instead of throwing.
 * 4. revalidatePath() for every route reading the changed data.
 *
 * Idempotency (PLAN.md ground rules + S8 brief "Idempotency: any action that
 * can be double-submitted ... must be safe to run twice"): every status
 * change below is a compare-and-swap UPDATE guarded by the row's current
 * status, so a double-submitted approve/decline/status-change/complete
 * either performs the transition exactly once or safely no-ops on the
 * retry — see the comment on each action.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, hasPermission, requirePermission } from "@/lib/auth/permissions";
import { emitEvent } from "@/lib/events/bus";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";
import type { ActionResult } from "@/app/(app)/maintenance/action-types";
import { closeOpenDowntimeSpan } from "@/app/(app)/maintenance/downtime";
import {
  discordFlagPayload,
  isValidWorkOrderTransition,
  requesterRecipientPayload,
  type WorkOrderStatus,
} from "@/app/(app)/maintenance/logic";
import {
  addWorkOrderCommentSchema,
  approveRequestSchema,
  assignWorkOrderSchema,
  completeWorkOrderSchema,
  createWorkOrderSchema,
  declineRequestSchema,
  submitMaintenanceRequestSchema,
  updateWorkOrderStatusSchema,
  type AddWorkOrderCommentInput,
  type ApproveRequestInput,
  type AssignWorkOrderInput,
  type CompleteWorkOrderInput,
  type CreateWorkOrderInput,
  type DeclineRequestInput,
  type SubmitMaintenanceRequestInput,
  type UpdateWorkOrderStatusInput,
} from "@/app/(app)/maintenance/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function revalidateMaintenance(workOrderId?: string) {
  revalidatePath("/maintenance");
  if (workOrderId) revalidatePath(`/maintenance/${workOrderId}`);
}

/**
 * Resolves the maintenance requester for a work order so `work_order_status`
 * events can notify them as the order moves through its lifecycle
 * (ARCHITECTURE.md "Requests": the submitter "is notified as its status
 * changes"). Returns the canonical `{ user_id }` recipient fragment the notify
 * drain reads (lib/notify/recipients.ts), or `{}` when the work order was
 * created directly (no `request_id`) and so has no distinct requester to notify.
 *
 * N4: without this, every `work_order_status` emit carried no recipient at all,
 * so despite the key being in NOTIFIABLE_EVENT_KEYS the drain resolved zero
 * recipients and the requester was never notified of in_progress / on_hold /
 * cancelled / complete transitions. The lookup runs on the per-request client;
 * maintenance_requests is readable by any signed-in user
 * (maintenance_requests_select_authenticated), so the assignee-self-service
 * path resolves the requester too, not just triage leaders.
 */
async function workOrderRequesterPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string | null,
): Promise<{ user_id?: string }> {
  if (!requestId) return {};
  const { data } = await supabase
    .from("maintenance_requests")
    .select("submitted_by")
    .eq("id", requestId)
    .maybeSingle();
  return requesterRecipientPayload(data?.submitted_by ?? null);
}

/**
 * Any team member can submit a request (ARCHITECTURE.md "Requests": "any
 * team member submits a maintenance request"). maintenance.request is a base
 * permission key granted to every seeded role.
 */
export async function submitMaintenanceRequest(
  input: SubmitMaintenanceRequestInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("maintenance.request");
    const parsed = submitMaintenanceRequestSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("maintenance_requests")
      .insert({
        title: parsed.title,
        description: parsed.description ?? null,
        equipment_id: parsed.equipmentId ?? null,
        area: parsed.area ?? null,
        suggested_priority: parsed.suggestedPriority ?? null,
        photo_urls: parsed.photoUrls.length > 0 ? parsed.photoUrls : null,
        submitted_by: user?.id ?? null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not submit the request." };
    }

    await emitEvent("maint_request", { requestId: data.id, status: "pending" });

    revalidateMaintenance();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Triage approve: converts a pending request into a work order
 * (ARCHITECTURE.md "Triage": "Approval converts the request into a work
 * order"). Idempotent: the status flip is a compare-and-swap on
 * `status = 'pending'`; a retry (double-submit) that loses the race finds
 * the request already approved and returns the existing work order instead
 * of creating a second one.
 */
export async function approveRequest(
  input: ApproveRequestInput,
): Promise<ActionResult<{ workOrderId: string }>> {
  try {
    await requirePermission("maintenance.triage");
    const parsed = approveRequestSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: request, error: fetchError } = await supabase
      .from("maintenance_requests")
      .select("id, title, description, equipment_id, status, work_order_id, submitted_by")
      .eq("id", parsed.requestId)
      .single();

    if (fetchError || !request) {
      return { ok: false, error: "Request not found." };
    }

    if (request.status !== "pending") {
      // Idempotent no-op: a previous call already resolved this request.
      if (request.status === "approved" && request.work_order_id) {
        return { ok: true, data: { workOrderId: request.work_order_id } };
      }
      return { ok: false, error: "This request has already been reviewed." };
    }

    const { data: claimed, error: claimError } = await supabase
      .from("maintenance_requests")
      .update({ status: "approved", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", parsed.requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) {
      return { ok: false, error: claimError.message };
    }

    if (!claimed) {
      // Lost the race to a concurrent approve/decline; re-fetch for the
      // idempotent response instead of creating a duplicate work order.
      const { data: current } = await supabase
        .from("maintenance_requests")
        .select("status, work_order_id")
        .eq("id", parsed.requestId)
        .single();
      if (current?.status === "approved" && current.work_order_id) {
        return { ok: true, data: { workOrderId: current.work_order_id } };
      }
      return { ok: false, error: "This request has already been reviewed." };
    }

    const { data: workOrder, error: insertError } = await supabase
      .from("work_orders")
      .insert({
        request_id: request.id,
        title: request.title,
        description: request.description,
        equipment_id: request.equipment_id,
        priority: parsed.priority,
        status: "open",
        assigned_user_id: parsed.assignedUserId ?? null,
        vendor_id: parsed.vendorId ?? null,
        scheduled_for: parsed.scheduledFor ?? null,
        due_at: parsed.dueAt ?? null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (insertError || !workOrder) {
      return { ok: false, error: insertError?.message ?? "Could not create the work order." };
    }

    const { error: linkError } = await supabase
      .from("maintenance_requests")
      .update({ work_order_id: workOrder.id })
      .eq("id", request.id);

    if (linkError) {
      return { ok: false, error: linkError.message };
    }

    await emitEvent("maint_request", {
      requestId: request.id,
      status: "approved",
      workOrderId: workOrder.id,
      ...requesterRecipientPayload(request.submitted_by),
    });
    await emitEvent("work_order_status", { workOrderId: workOrder.id, status: "open" });

    revalidateMaintenance(workOrder.id);
    return { ok: true, data: { workOrderId: workOrder.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Triage decline: sent back to the requester with a reason (ARCHITECTURE.md
 * "Triage": "declines with a reason that is sent back to the requester").
 * Idempotent the same way as approveRequest: a retry that finds the request
 * already declined is treated as a success no-op rather than an error.
 */
export async function declineRequest(input: DeclineRequestInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.triage");
    const parsed = declineRequestSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: claimed, error } = await supabase
      .from("maintenance_requests")
      .update({
        status: "declined",
        declined_reason: parsed.declinedReason,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", parsed.requestId)
      .eq("status", "pending")
      .select("id, submitted_by")
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!claimed) {
      const { data: current } = await supabase
        .from("maintenance_requests")
        .select("status")
        .eq("id", parsed.requestId)
        .single();
      if (current?.status === "declined") {
        return { ok: true, data: undefined };
      }
      return { ok: false, error: "This request has already been reviewed." };
    }

    await emitEvent("maint_request", {
      requestId: parsed.requestId,
      status: "declined",
      ...requesterRecipientPayload(claimed.submitted_by),
    });

    revalidateMaintenance();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Direct work order creation without a triage request (e.g. a leader
 * spotting something themselves). Same permission tier as approving a
 * request off the queue.
 */
export async function createWorkOrder(
  input: CreateWorkOrderInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("maintenance.triage");
    const parsed = createWorkOrderSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("work_orders")
      .insert({
        title: parsed.title,
        description: parsed.description ?? null,
        equipment_id: parsed.equipmentId ?? null,
        priority: parsed.priority,
        status: "open",
        assigned_user_id: parsed.assignedUserId ?? null,
        vendor_id: parsed.vendorId ?? null,
        scheduled_for: parsed.scheduledFor ?? null,
        due_at: parsed.dueAt ?? null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the work order." };
    }

    await emitEvent("work_order_status", { workOrderId: data.id, status: "open" });

    revalidateMaintenance(data.id);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Re-assigns/reschedules an existing work order. Does not change status. */
export async function assignWorkOrder(input: AssignWorkOrderInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.triage");
    const parsed = assignWorkOrderSchema.parse(input);
    const supabase = await createClient();

    const update: Database["public"]["Tables"]["work_orders"]["Update"] = {
      assigned_user_id: parsed.assignedUserId ?? null,
      vendor_id: parsed.vendorId ?? null,
    };
    if (parsed.scheduledFor !== undefined) update.scheduled_for = parsed.scheduledFor;
    if (parsed.dueAt !== undefined) update.due_at = parsed.dueAt;
    if (parsed.priority !== undefined) update.priority = parsed.priority;
    if (parsed.notifyDiscord !== undefined) update.notify_discord = parsed.notifyDiscord;
    if (parsed.discordChannelId !== undefined) update.discord_channel_id = parsed.discordChannelId ?? null;

    const { error } = await supabase.from("work_orders").update(update).eq("id", parsed.workOrderId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateMaintenance(parsed.workOrderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Grants either the maintenance.triage permission or the work order's own
 * assignee self-service access to move/complete/comment on their own ticket
 * (ARCHITECTURE.md "Work orders": "Assigned to a team member ... or a
 * vendor"; an in-house assignee needs to progress their own work without
 * needing the leader tier's triage permission). Mirrors the RLS policy in
 * supabase/migrations/<ts>_vendors_maintenance_rls.sql
 * (work_orders_write_manager_or_assignee).
 */
async function canWriteWorkOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignedUserId: string | null,
): Promise<boolean> {
  if (await hasPermission("maintenance.triage")) return true;
  if (!assignedUserId) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id === assignedUserId;
}

/**
 * Moves a work order through open -> in_progress -> on_hold -> cancelled.
 * "complete" is intentionally excluded here — completeWorkOrder() below is
 * the only path to "complete" so cost/invoice are always captured together
 * with the status flip.
 *
 * Idempotent: requesting the CURRENT status is a no-op success (safe to
 * double-click "Start" or "Hold"). The actual transition is a
 * compare-and-swap on the row's current status so two concurrent submits
 * can't both apply.
 */
export async function updateWorkOrderStatus(
  input: UpdateWorkOrderStatusInput,
): Promise<ActionResult> {
  try {
    const parsed = updateWorkOrderStatusSchema.parse(input);
    if (parsed.status === "complete") {
      return { ok: false, error: "Use \"Complete\" with a cost/invoice instead." };
    }

    const supabase = await createClient();
    const { data: workOrder, error: fetchError } = await supabase
      .from("work_orders")
      .select("id, status, assigned_user_id, notify_discord, discord_channel_id, request_id")
      .eq("id", parsed.workOrderId)
      .single();

    if (fetchError || !workOrder) {
      return { ok: false, error: "Work order not found." };
    }

    if (!(await canWriteWorkOrder(supabase, workOrder.assigned_user_id))) {
      return { ok: false, error: "You don't have permission to do this." };
    }

    const currentStatus = workOrder.status as WorkOrderStatus;
    const nextStatus = parsed.status as WorkOrderStatus;

    if (currentStatus === nextStatus) {
      return { ok: true, data: undefined };
    }

    if (!isValidWorkOrderTransition(currentStatus, nextStatus)) {
      return { ok: false, error: `Cannot move a ${currentStatus} work order to ${nextStatus}.` };
    }

    const { data: updated, error: updateError } = await supabase
      .from("work_orders")
      .update({ status: nextStatus })
      .eq("id", parsed.workOrderId)
      .eq("status", currentStatus)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    if (!updated) {
      // Lost a race with a concurrent status change; re-check for the
      // idempotent case instead of surfacing a spurious error.
      const { data: current } = await supabase
        .from("work_orders")
        .select("status")
        .eq("id", parsed.workOrderId)
        .single();
      if (current?.status === nextStatus) {
        return { ok: true, data: undefined };
      }
      return { ok: false, error: "Status changed elsewhere — refresh and try again." };
    }

    await emitEvent("work_order_status", {
      workOrderId: parsed.workOrderId,
      status: nextStatus,
      ...discordFlagPayload(workOrder),
      // N4: notify the original requester as their work order progresses.
      ...(await workOrderRequesterPayload(supabase, workOrder.request_id)),
    });

    revalidateMaintenance(parsed.workOrderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Completes a work order with cost + invoice (ARCHITECTURE.md "Work
 * orders": "record cost + invoice photo on completion"). Idempotent: an
 * already-complete work order returns success without overwriting the
 * recorded cost/invoice on a double submit.
 */
export async function completeWorkOrder(input: CompleteWorkOrderInput): Promise<ActionResult> {
  try {
    const parsed = completeWorkOrderSchema.parse(input);
    const supabase = await createClient();

    const { data: workOrder, error: fetchError } = await supabase
      .from("work_orders")
      .select("id, status, assigned_user_id, equipment_id, notify_discord, discord_channel_id, request_id")
      .eq("id", parsed.workOrderId)
      .single();

    if (fetchError || !workOrder) {
      return { ok: false, error: "Work order not found." };
    }

    if (!(await canWriteWorkOrder(supabase, workOrder.assigned_user_id))) {
      return { ok: false, error: "You don't have permission to do this." };
    }

    if (workOrder.status === "complete") {
      // Idempotent no-op: already completed by an earlier submit.
      return { ok: true, data: undefined };
    }

    const currentStatus = workOrder.status as WorkOrderStatus;
    if (!isValidWorkOrderTransition(currentStatus, "complete")) {
      return { ok: false, error: `A ${currentStatus} work order must be in progress before it can be completed.` };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: updated, error: updateError } = await supabase
      .from("work_orders")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
        completed_by: user?.id ?? null,
        cost: parsed.cost ?? null,
        invoice_url: parsed.invoiceUrl ?? null,
      })
      .eq("id", parsed.workOrderId)
      .neq("status", "complete")
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    if (!updated) {
      // Someone else completed it a moment ago — idempotent success.
      return { ok: true, data: undefined };
    }

    // Gated on maintenance.manage (not just the completer's own access):
    // equipment/equipment_downtime writes are maintenance.manage-only in
    // RLS, a narrower tier than "can complete this work order" (triage or
    // the order's own assignee). The UI only offers this checkbox to
    // maintenance.manage holders (components/maintenance/work-order-detail.tsx),
    // but re-checking here means a direct call can't silently no-op against
    // RLS and look like it succeeded.
    if (parsed.markEquipmentUp && workOrder.equipment_id && (await hasPermission("maintenance.manage"))) {
      await closeOpenDowntimeSpan(supabase, workOrder.equipment_id);
    }

    await emitEvent("work_order_status", {
      workOrderId: parsed.workOrderId,
      status: "complete",
      ...discordFlagPayload(workOrder),
      // N4: notify the original requester their work order is complete.
      ...(await workOrderRequesterPayload(supabase, workOrder.request_id)),
    });

    revalidateMaintenance(parsed.workOrderId);
    revalidatePath("/maintenance/equipment");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Comment/photo thread on a work order (before/after shots). */
export async function addWorkOrderComment(input: AddWorkOrderCommentInput): Promise<ActionResult> {
  try {
    await requirePermission("maintenance.request");
    const parsed = addWorkOrderCommentSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("work_order_comments").insert({
      work_order_id: parsed.workOrderId,
      author_id: user?.id ?? null,
      body: parsed.body ?? null,
      photo_url: parsed.photoUrl ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateMaintenance(parsed.workOrderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
