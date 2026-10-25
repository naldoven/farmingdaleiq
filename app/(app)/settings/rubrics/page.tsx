import { SectionCard } from "@/components/mobile";
import { RubricsEditor, type RubricPositionRow } from "@/components/settings/rubrics-editor";
import { SetupDefaultTag } from "@/components/settings/setup-default-tag";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getConfirmedAreas } from "@/lib/store-setup/status";
import { buildRubricRows } from "@/app/(app)/settings/rubrics/logic";

/**
 * /settings/rubrics (docs/STORE-SETUP.md, area "rating_rubrics"). Decides,
 * per rateable position, whether leaders quick-rate it or score four named
 * categories. rating_rubrics is owned by the Ratings module and written
 * only through its upsertRubric action, which checks training.manage, so
 * this page requires the same key rather than settings.manage.
 */
export const metadata = { title: "Rating rubrics" };

export default async function RubricsSettingsPage() {
  await requirePermission("training.manage");

  const supabase = await createClient();
  const [{ data: positions, error }, { data: groups }, { data: rubrics }, setupAreas] = await Promise.all([
    supabase
      .from("positions")
      .select("id, name, group_id, sort")
      .eq("is_rateable", true)
      .order("sort")
      .order("name"),
    supabase.from("position_groups").select("id, name"),
    supabase.from("rating_rubrics").select("position_id, category_1, category_2, category_3, category_4"),
    getConfirmedAreas(supabase),
  ]);

  if (error) {
    throw new Error(`Could not load positions: ${error.message}`);
  }

  const rows: RubricPositionRow[] = buildRubricRows(positions ?? [], groups ?? [], rubrics ?? []);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted-ink">
          Stations with a rubric are scored on up to four named categories. Stations without one get a
          single quick rating.
        </p>
        <SetupDefaultTag area="rating_rubrics" confirmed={setupAreas.keys} />
      </div>
      <SectionCard title={`Rateable positions (${rows.length})`} flush>
        <RubricsEditor positions={rows} />
      </SectionCard>
    </div>
  );
}
