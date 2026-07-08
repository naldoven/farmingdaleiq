import { SectionCard, StatusBadge } from "@/components/mobile";
import { CreateTierForm } from "@/components/training/create-tier-form";
import { OrgTierCard } from "@/components/training/org-tier-card";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const DEPARTMENTS = ["foh", "kitchen", "store"] as const;
const DEPARTMENT_LABEL: Record<(typeof DEPARTMENTS)[number], string> = {
  foh: "FOH",
  kitchen: "Kitchen",
  store: "Store",
};

/**
 * /people/org-chart — Editable org chart: tiers, goal counts, filled and
 * vacant slots. ARCHITECTURE.md "Trainee lifecycle" > "Org chart".
 *
 * Restyled to the KitchenIQ mobile design system (docs/DESIGN-SYSTEM.md):
 * department groups are SectionLabels, each tier is a SectionCard
 * (OrgTierCard). Same queries and permission checks as before.
 */
export default async function OrgChartPage() {
  await requirePermission("training.view");
  const canManage = await hasPermission("training.org_chart_manage");

  const supabase = await createClient();

  const [{ data: tiers }, { data: slots }, { data: people }] = await Promise.all([
    supabase.from("org_tiers").select("id, department, name, goal_count, sort").order("sort"),
    supabase.from("org_slots").select("id, tier_id, user_id, label, sort, profiles(name)").order("sort"),
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
  ]);

  const totalVacancy = (tiers ?? []).reduce((sum, tier) => {
    const tierSlots = (slots ?? []).filter((s) => s.tier_id === tier.id);
    const filled = tierSlots.filter((s) => s.user_id !== null).length;
    return sum + Math.max(tier.goal_count - filled, 0);
  }, 0);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <StatusBadge tone={totalVacancy > 0 ? "warning" : "success"}>{totalVacancy} total vacancies</StatusBadge>
      </div>

      {canManage && (
        <SectionCard title="Add a tier">
          <CreateTierForm />
        </SectionCard>
      )}

      {DEPARTMENTS.map((department) => {
        const departmentTiers = (tiers ?? []).filter((t) => t.department === department);
        if (departmentTiers.length === 0) return null;
        return (
          <div key={department} className="flex flex-col gap-3">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-ink">
              {DEPARTMENT_LABEL[department]}
            </p>
            {departmentTiers.map((tier) => (
              <OrgTierCard
                key={tier.id}
                tierId={tier.id}
                name={tier.name}
                goalCount={tier.goal_count}
                slots={(slots ?? [])
                  .filter((s) => s.tier_id === tier.id)
                  .map((s) => ({
                    id: s.id,
                    userId: s.user_id,
                    userName: (s.profiles as unknown as { name: string } | null)?.name ?? null,
                    label: s.label,
                  }))}
                people={people ?? []}
                canManage={canManage}
              />
            ))}
          </div>
        );
      })}

      {(tiers ?? []).length === 0 && <p className="text-[13px] text-muted-ink">No org tiers yet.</p>}
    </div>
  );
}
