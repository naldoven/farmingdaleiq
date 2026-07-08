import { notFound } from "next/navigation";

import { EquipmentDetail } from "@/components/maintenance/equipment-detail";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /maintenance/equipment/[id] — one unit's full page (ARCHITECTURE.md
 * "Equipment registry": "category, store area, model/serial, service
 * vendor, install date, warranty expiry, attached manuals, and its full
 * work-order history").
 */
export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("maintenance.request");
  const { id } = await params;
  const canManage = await hasPermission("maintenance.manage");

  const supabase = await createClient();

  const { data: equipment } = await supabase
    .from("equipment")
    .select(
      "id, name, category, area, model, serial, service_vendor_id, installed_on, warranty_expires_on, status, notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (!equipment) {
    notFound();
  }

  const [
    { data: vendorRow },
    { data: files },
    { data: downtime },
    { data: workOrders },
    { data: pmSchedules },
    { data: profiles },
    { data: vendors },
  ] = await Promise.all([
    equipment.service_vendor_id
      ? supabase.from("vendors").select("name").eq("id", equipment.service_vendor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("equipment_files").select("id, file_url, label").eq("equipment_id", id),
    supabase
      .from("equipment_downtime")
      .select("id, started_at, ended_at")
      .eq("equipment_id", id)
      .order("started_at", { ascending: false }),
    supabase
      .from("work_orders")
      .select("id, title, status, created_at")
      .eq("equipment_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pm_schedules")
      .select(
        "id, title, description, interval_days, lead_days, next_due_on, checklist_template_id, assign_user_id, vendor_id, priority, active",
      )
      .eq("equipment_id", id)
      .order("title"),
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase.from("vendors").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-[480px]">
      <EquipmentDetail
        equipment={{
          id: equipment.id,
          name: equipment.name,
          category: equipment.category,
          area: equipment.area,
          model: equipment.model,
          serial: equipment.serial,
          service_vendor_name: vendorRow?.name ?? null,
          installed_on: equipment.installed_on,
          warranty_expires_on: equipment.warranty_expires_on,
          status: equipment.status,
          notes: equipment.notes,
        }}
        files={files ?? []}
        downtime={downtime ?? []}
        workOrders={workOrders ?? []}
        pmSchedules={pmSchedules ?? []}
        assigneeOptions={profiles ?? []}
        vendorOptions={vendors ?? []}
        canManage={canManage}
      />
    </div>
  );
}
