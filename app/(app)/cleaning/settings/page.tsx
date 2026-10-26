import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canPlanCleaning,
  loadSlotCaps,
  loadZones,
} from "@/app/(app)/cleaning/queries";
import {
  buildCapsGrid,
  COORDINATOR_MAX_RANK,
  coordinatorOptions,
  coordinatorRows,
  type ProfileLike,
  type RoleLike,
} from "@/app/(app)/cleaning/settings-view";
import { SettingsCapsGrid } from "@/components/cleaning/settings-caps-grid";
import { SettingsCoordinators } from "@/components/cleaning/settings-coordinators";
import { SettingsZones } from "@/components/cleaning/settings-zones";
import { PermissionError, hasPermission } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

/**
 * /cleaning/settings (docs/CLEANING-PLAN.md "Screens"): the slot-cap grid,
 * the zone switches and the coordinator tags. Planners only, and the tag
 * counts: a coordinator holds no cleaning.plan key but can plan. Adding and
 * removing coordinators needs the key itself, so for a tag-only coordinator
 * that card is read only.
 *
 * Not in the nav; the week board links here.
 */
export const metadata = { title: "Cleaning settings" };

type Client = SupabaseClient<Database>;

async function loadCoordinatorData(supabase: Client, canManage: boolean) {
  const [rolesResult, taggedResult] = await Promise.all([
    supabase.from("roles").select("id, name, rank"),
    supabase.from("cleaning_coordinators").select("user_id").order("added_at"),
  ]);
  if (rolesResult.error) throw new Error(`Could not load roles: ${rolesResult.error.message}`);
  if (taggedResult.error) throw new Error(`Could not load coordinators: ${taggedResult.error.message}`);

  const roles: RoleLike[] = rolesResult.data ?? [];
  const tagged = taggedResult.data ?? [];
  const taggedIds = tagged.map((row) => row.user_id);

  // Two bounded lookups instead of the whole roster: the people already
  // tagged (any state, so a stale tag can still be removed) and, only for
  // someone who can add, the active leaders and trainers to pick from.
  const leaderRoleIds = roles
    .filter((role) => role.rank !== null && role.rank <= COORDINATOR_MAX_RANK)
    .map((role) => role.id);

  const [taggedProfiles, candidates] = await Promise.all([
    taggedIds.length > 0
      ? supabase.from("profiles").select("id, name, active, role_id").in("id", taggedIds)
      : Promise.resolve({ data: [] as ProfileLike[], error: null }),
    canManage && leaderRoleIds.length > 0
      ? supabase.from("profiles").select("id, name, active, role_id").eq("active", true).in("role_id", leaderRoleIds)
      : Promise.resolve({ data: [] as ProfileLike[], error: null }),
  ]);
  if (taggedProfiles.error) throw new Error(`Could not load coordinators: ${taggedProfiles.error.message}`);
  if (candidates.error) throw new Error(`Could not load leaders: ${candidates.error.message}`);

  return {
    coordinators: coordinatorRows(tagged, taggedProfiles.data ?? [], roles),
    options: coordinatorOptions(candidates.data ?? [], roles, new Set(taggedIds)),
  };
}

export default async function CleaningSettingsPage() {
  const supabase = await createClient();
  if (!(await canPlanCleaning(supabase))) {
    // Same outcome as requirePermission: the (app) error boundary renders the
    // friendly "couldn't open this page" screen.
    throw new PermissionError("cleaning.plan");
  }
  const canManageCoordinators = await hasPermission("cleaning.plan");

  const [zones, caps, people] = await Promise.all([
    loadZones(supabase),
    loadSlotCaps(supabase),
    loadCoordinatorData(supabase, canManageCoordinators),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold leading-tight text-ink">Cleaning settings</h1>
        <p className="text-[15px] text-muted-ink">How many cleans the weekly build places, and who plans.</p>
      </div>

      <SettingsCapsGrid initial={buildCapsGrid(caps)} />
      <SettingsZones zones={zones} />
      <SettingsCoordinators
        coordinators={people.coordinators}
        options={people.options}
        canManage={canManageCoordinators}
      />
    </div>
  );
}
