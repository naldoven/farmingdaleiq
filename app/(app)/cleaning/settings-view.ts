import { STORE_WEEKDAYS } from "@/app/(app)/cleaning/constants";

/**
 * Pure helpers for /cleaning/settings (docs/CLEANING-PLAN.md "Screens").
 * Kept apart from the page and the actions so the slot-cap grid and the
 * coordinator picker can be tested without Supabase.
 */

// Slot caps ------------------------------------------------------------------

export const CAP_MIN = 0;
export const CAP_MAX = 20;

/**
 * What the Thursday build uses for a slot with no row (planWeek reads a
 * missing key as 0). The migration seeds all twelve rows at 2, so this only
 * shows if rows were deleted. Showing 0 there keeps the grid honest: a
 * planner who saw "2" and did not touch it would get a build with no
 * variable cleans placed at all.
 */
export const MISSING_CAP = 0;

export type CapHalf = "am" | "pm";

const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export interface CapsGridRow {
  /** 1 = Monday .. 6 = Saturday. */
  weekday: number;
  short: string;
  name: string;
  am: number;
  pm: number;
}

export interface CapInput {
  weekday: number;
  half: CapHalf;
  maxVariables: number;
}

export function clampCap(value: number): number {
  if (!Number.isFinite(value)) return CAP_MIN;
  return Math.min(CAP_MAX, Math.max(CAP_MIN, Math.trunc(value)));
}

/** Mon to Sat rows from loadSlotCaps' "weekday|half" map. */
export function buildCapsGrid(caps: ReadonlyMap<string, number>): CapsGridRow[] {
  return STORE_WEEKDAYS.map(({ value, short }) => ({
    weekday: value,
    short,
    name: DAY_NAMES[value] ?? short,
    am: clampCap(caps.get(`${value}|am`) ?? MISSING_CAP),
    pm: clampCap(caps.get(`${value}|pm`) ?? MISSING_CAP),
  }));
}

/** Returns a new grid with one slot changed; the input is never mutated. */
export function setCap(grid: CapsGridRow[], weekday: number, half: CapHalf, value: number): CapsGridRow[] {
  return grid.map((row) => (row.weekday === weekday ? { ...row, [half]: clampCap(value) } : row));
}

/** The twelve rows saveSlotCaps takes. */
export function gridToCaps(grid: CapsGridRow[]): CapInput[] {
  return grid.flatMap((row) => [
    { weekday: row.weekday, half: "am" as const, maxVariables: clampCap(row.am) },
    { weekday: row.weekday, half: "pm" as const, maxVariables: clampCap(row.pm) },
  ]);
}

export function capsEqual(a: CapsGridRow[], b: CapsGridRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row.weekday === b[i]!.weekday && row.am === b[i]!.am && row.pm === b[i]!.pm);
}

// Coordinators ------------------------------------------------------------------

/**
 * Highest role rank (1 is the most senior) that can hold the coordinator tag:
 * Team Leader and up plus both trainer roles. The same cutoff the migration
 * uses for cleaning.complete, so a coordinator can always open the screens
 * the tag lets them plan.
 */
export const COORDINATOR_MAX_RANK = 8;

export interface ProfileLike {
  id: string;
  name: string;
  active: boolean;
  role_id: string | null;
}

export interface RoleLike {
  id: string;
  name: string;
  rank: number | null;
}

/**
 * The tag grants planning rights, so it goes only to an active leader or
 * trainer. The picker filters on this and the addCoordinator action repeats
 * it, because a hidden option is not a control.
 */
export function isCoordinatorEligible(active: boolean, rank: number | null | undefined): boolean {
  return active && typeof rank === "number" && rank <= COORDINATOR_MAX_RANK;
}

export interface CoordinatorOption {
  id: string;
  name: string;
  roleName: string;
}

export interface CoordinatorRow {
  userId: string;
  name: string;
  roleName: string;
  /** An inactive profile keeps its tag row but can no longer plan. */
  active: boolean;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

/** Active leaders and trainers not yet tagged, A to Z. */
export function coordinatorOptions(
  profiles: ProfileLike[],
  roles: RoleLike[],
  taggedIds: ReadonlySet<string>,
): CoordinatorOption[] {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const options: CoordinatorOption[] = [];
  for (const profile of profiles) {
    if (taggedIds.has(profile.id)) continue;
    const role = profile.role_id ? roleById.get(profile.role_id) : undefined;
    if (!role || !isCoordinatorEligible(profile.active, role.rank)) continue;
    options.push({ id: profile.id, name: profile.name, roleName: role.name });
  }
  return options.sort(byName);
}

/**
 * Everyone holding the tag, A to Z. A tag whose profile cannot be read still
 * lists, as "Unknown person", so a planner can see and remove it.
 */
export function coordinatorRows(
  tagged: { user_id: string }[],
  profiles: ProfileLike[],
  roles: RoleLike[],
): CoordinatorRow[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  return tagged
    .map(({ user_id }) => {
      const profile = profileById.get(user_id);
      const role = profile?.role_id ? roleById.get(profile.role_id) : undefined;
      return {
        userId: user_id,
        name: profile?.name ?? "Unknown person",
        roleName: role?.name ?? "No role",
        active: profile?.active ?? false,
      };
    })
    .sort(byName);
}
