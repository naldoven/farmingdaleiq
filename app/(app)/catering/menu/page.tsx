import { MenuItemForm } from "@/components/catering/menu-item-form";
import { MenuItemRowActions } from "@/components/catering/menu-item-row-actions";
import { ListRow, SectionCard, SectionLabel, StatusBadge } from "@/components/mobile";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ChecklistDefaultsManager } from "@/app/(app)/catering/menu/checklist-defaults-manager";
import type { ChecklistStage } from "@/app/(app)/catering/logic";

function formatPrice(cents: number | null) {
  return cents === null ? "Not listed" : `$${(cents / 100).toFixed(2)}`;
}

/**
 * /catering/menu — ARCHITECTURE.md page map: "Menu item catalog admin
 * (components, scaling rules)." Also owns per-stage checklist default
 * templates (parity audit Catering finding: "No admin UI for per-stage
 * checklist default templates").
 */
export default async function CateringMenuPage() {
  await requirePermission("catering.view");
  const canManage = await hasPermission("catering.manage");

  const supabase = await createClient();
  const [{ data: menuItems }, { data: checklistDefaults }] = await Promise.all([
    supabase
      .from("catering_menu_items")
      .select("id, name, category, pickup_price_cents, delivery_price_cents, components, scaling_rules, active")
      .order("category")
      .order("name"),
    supabase
      .from("catering_checklist_defaults")
      .select("id, stage, label, active")
      .order("sort"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Catering menu</SectionLabel>

      {canManage && <MenuItemForm />}

      <SectionCard title={`Catalog (${(menuItems ?? []).length})`} flush>
        <div className="divide-y divide-line">
          {(menuItems ?? []).map((item) => (
            <ListRow
              key={item.id}
              title={item.name}
              description={`${item.category ?? "No category"} · Pickup ${formatPrice(item.pickup_price_cents)} · Delivery ${formatPrice(item.delivery_price_cents)}`}
              trailing={
                <div className="flex items-center gap-2">
                  <StatusBadge tone={item.active ? "success" : "neutral"} dot>
                    {item.active ? "Active" : "Inactive"}
                  </StatusBadge>
                  {canManage && (
                    <MenuItemRowActions
                      item={{
                        id: item.id,
                        name: item.name,
                        category: item.category ?? "",
                        pickupPriceText: item.pickup_price_cents === null ? "" : (item.pickup_price_cents / 100).toFixed(2),
                        deliveryPriceText: item.delivery_price_cents === null ? "" : (item.delivery_price_cents / 100).toFixed(2),
                        componentsText: JSON.stringify(item.components ?? []),
                        scalingRulesText: JSON.stringify(item.scaling_rules ?? []),
                        active: item.active,
                      }}
                    />
                  )}
                </div>
              }
            />
          ))}
          {(menuItems ?? []).length === 0 && (
            <p className="px-4 py-3 text-[13px] text-muted-ink">No menu items yet.</p>
          )}
        </div>
      </SectionCard>

      {canManage && (
        <SectionCard title="Per-stage checklist defaults">
          <ChecklistDefaultsManager
            defaults={(checklistDefaults ?? []).map((d) => ({
              id: d.id,
              stage: d.stage as ChecklistStage,
              label: d.label,
              active: d.active,
            }))}
          />
        </SectionCard>
      )}
    </div>
  );
}
