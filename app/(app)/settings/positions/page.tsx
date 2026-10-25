import { PositionsEditor } from "@/components/settings/positions-editor";
import { SetupDefaultTag } from "@/components/settings/setup-default-tag";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getConfirmedAreas } from "@/lib/store-setup/status";
import { trainingStationIds } from "@/app/(app)/settings/positions/logic";

/**
 * /settings/positions (docs/STORE-SETUP.md, area "positions"). Position
 * groups and positions feed the Ratings matrix columns and the Training
 * passports; the only editor was under the dormant Setups module. This is
 * the live one. settings.manage gates the page and every action.
 */
export const metadata = { title: "Positions" };

export default async function PositionsSettingsPage() {
  await requirePermission("settings.manage");

  const supabase = await createClient();
  const [{ data: groups, error: groupsError }, { data: positions, error: positionsError }, { data: stations }, setupAreas] =
    await Promise.all([
      supabase.from("position_groups").select("id, name, sort").order("sort").order("name"),
      supabase.from("positions").select("id, group_id, name, sort, is_rateable").order("sort").order("name"),
      supabase.from("roadmap_stations").select("position_id"),
      getConfirmedAreas(supabase),
    ]);

  if (groupsError || positionsError) {
    throw new Error(`Could not load positions: ${(groupsError ?? positionsError)?.message}`);
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted-ink">
          Groups are the areas of the store. Positions are the stations inside them. Rateable
          positions become columns on the Ratings matrix.
        </p>
        <SetupDefaultTag area="positions" confirmed={setupAreas.keys} />
      </div>
      <PositionsEditor
        groups={groups ?? []}
        positions={positions ?? []}
        trainingStationIds={Array.from(trainingStationIds(stations ?? []))}
      />
    </div>
  );
}
