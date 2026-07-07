import { notFound } from "next/navigation";

import { WorkOrderDetail } from "@/components/maintenance/work-order-detail";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /maintenance/[id] — work order detail: status controls, assignment,
 * cost/invoice completion, comment/photo thread (ARCHITECTURE.md
 * "Work orders").
 */
export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("maintenance.request");
  const { id } = await params;
  const canAssign = await hasPermission("maintenance.triage");
  const canManageEquipment = await hasPermission("maintenance.manage");

  const supabase = await createClient();

  const { data: workOrder } = await supabase
    .from("work_orders")
    .select(
      "id, title, description, status, priority, equipment_id, assigned_user_id, vendor_id, scheduled_for, due_at, completed_at, cost, invoice_url, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!workOrder) {
    notFound();
  }

  const [{ data: comments }, { data: equipment }, { data: assignedProfile }, { data: vendor }, { data: profiles }, { data: vendors }] =
    await Promise.all([
      supabase
        .from("work_order_comments")
        .select("id, author_id, body, photo_url, created_at")
        .eq("work_order_id", id)
        .order("created_at"),
      workOrder.equipment_id
        ? supabase.from("equipment").select("name").eq("id", workOrder.equipment_id).maybeSingle()
        : Promise.resolve({ data: null }),
      workOrder.assigned_user_id
        ? supabase.from("profiles").select("name").eq("id", workOrder.assigned_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      workOrder.vendor_id
        ? supabase.from("vendors").select("name").eq("id", workOrder.vendor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("profiles").select("id, name").eq("active", true).order("name"),
      supabase.from("vendors").select("id, name").eq("active", true).order("name"),
    ]);

  const authorIds = Array.from(
    new Set((comments ?? []).map((c) => c.author_id).filter((v): v is string => Boolean(v))),
  );
  const { data: authors } =
    authorIds.length > 0
      ? await supabase.from("profiles").select("id, name").in("id", authorIds)
      : { data: [] };
  const authorNameById = new Map((authors ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="mx-auto max-w-3xl">
      <WorkOrderDetail
        workOrder={{
          id: workOrder.id,
          title: workOrder.title,
          description: workOrder.description,
          status: workOrder.status,
          priority: workOrder.priority,
          equipment_id: workOrder.equipment_id,
          equipment_name: equipment?.name ?? null,
          assigned_user_id: workOrder.assigned_user_id,
          assigned_user_name: assignedProfile?.name ?? null,
          vendor_id: workOrder.vendor_id,
          vendor_name: vendor?.name ?? null,
          scheduled_for: workOrder.scheduled_for,
          due_at: workOrder.due_at,
          completed_at: workOrder.completed_at,
          cost: workOrder.cost,
          invoice_url: workOrder.invoice_url,
          created_at: workOrder.created_at,
        }}
        comments={(comments ?? []).map((c) => ({
          id: c.id,
          author_name: c.author_id ? (authorNameById.get(c.author_id) ?? null) : null,
          body: c.body,
          photo_url: c.photo_url,
          created_at: c.created_at,
        }))}
        canAssign={canAssign}
        canManageEquipment={canManageEquipment}
        assigneeOptions={profiles ?? []}
        vendorOptions={vendors ?? []}
      />
    </div>
  );
}
