import { describe, expect, it } from "vitest";

import {
  CAP_MAX,
  COORDINATOR_MAX_RANK,
  MISSING_CAP,
  buildCapsGrid,
  capsEqual,
  clampCap,
  coordinatorOptions,
  coordinatorRows,
  gridToCaps,
  isCoordinatorEligible,
  setCap,
  type ProfileLike,
  type RoleLike,
} from "@/app/(app)/cleaning/settings-view";
import { slotCapsSchema } from "@/app/(app)/cleaning/validation";

function fullCaps(value = 2): Map<string, number> {
  const caps = new Map<string, number>();
  for (let weekday = 1; weekday <= 6; weekday += 1) {
    caps.set(`${weekday}|am`, value);
    caps.set(`${weekday}|pm`, value);
  }
  return caps;
}

describe("clampCap", () => {
  it("keeps 0 to 20 and clamps anything outside", () => {
    expect(clampCap(0)).toBe(0);
    expect(clampCap(20)).toBe(20);
    expect(clampCap(-1)).toBe(0);
    expect(clampCap(21)).toBe(CAP_MAX);
  });

  it("drops fractions and treats junk as 0", () => {
    expect(clampCap(3.9)).toBe(3);
    expect(clampCap(Number.NaN)).toBe(0);
    expect(clampCap(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("buildCapsGrid", () => {
  it("builds Monday to Saturday with AM and PM from the loaded map", () => {
    const caps = fullCaps(2);
    caps.set("4|am", 0);
    caps.set("4|pm", 5);
    const grid = buildCapsGrid(caps);

    expect(grid.map((row) => row.short)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(grid.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(grid[3]).toMatchObject({ name: "Thursday", am: 0, pm: 5 });
    expect(grid[0]).toMatchObject({ name: "Monday", am: 2, pm: 2 });
  });

  it("shows a slot with no row as what the build will use, not as 2", () => {
    const caps = fullCaps(2);
    caps.delete("6|pm");
    const grid = buildCapsGrid(caps);
    expect(MISSING_CAP).toBe(0);
    expect(grid[5]).toMatchObject({ am: 2, pm: MISSING_CAP });
  });

  it("clamps a stored value that is out of range instead of passing it on", () => {
    const caps = fullCaps(2);
    caps.set("1|am", 99);
    expect(buildCapsGrid(caps)[0]!.am).toBe(CAP_MAX);
  });
});

describe("setCap", () => {
  it("changes one slot and leaves the original grid alone", () => {
    const grid = buildCapsGrid(fullCaps(2));
    const next = setCap(grid, 3, "pm", 7);
    expect(next[2]).toMatchObject({ am: 2, pm: 7 });
    expect(grid[2]).toMatchObject({ am: 2, pm: 2 });
    expect(next[0]).toBe(grid[0]);
  });

  it("clamps what it is given", () => {
    const grid = buildCapsGrid(fullCaps(2));
    expect(setCap(grid, 1, "am", -4)[0]!.am).toBe(0);
    expect(setCap(grid, 1, "am", 50)[0]!.am).toBe(CAP_MAX);
  });
});

describe("gridToCaps", () => {
  it("flattens to the twelve rows the action takes, and the action's schema accepts them", () => {
    const caps = gridToCaps(buildCapsGrid(fullCaps(3)));
    expect(caps).toHaveLength(12);
    expect(caps[0]).toEqual({ weekday: 1, half: "am", maxVariables: 3 });
    expect(caps[11]).toEqual({ weekday: 6, half: "pm", maxVariables: 3 });
    expect(slotCapsSchema.safeParse({ caps }).success).toBe(true);
  });

  it("round-trips a zero cap, which means no variables in that slot", () => {
    const grid = setCap(buildCapsGrid(fullCaps(2)), 2, "am", 0);
    expect(gridToCaps(grid).find((c) => c.weekday === 2 && c.half === "am")?.maxVariables).toBe(0);
  });
});

describe("capsEqual", () => {
  it("is true for the same numbers and false after any change", () => {
    const a = buildCapsGrid(fullCaps(2));
    expect(capsEqual(a, buildCapsGrid(fullCaps(2)))).toBe(true);
    expect(capsEqual(a, setCap(a, 5, "am", 1))).toBe(false);
  });
});

const ROLES: RoleLike[] = [
  { id: "r-lm", name: "Location Manager", rank: 2 },
  { id: "r-tl", name: "Team Leader", rank: 6 },
  { id: "r-trainer", name: "BOH Trainer", rank: 8 },
  { id: "r-tm", name: "Team Member", rank: 10 },
  { id: "r-none", name: "Unranked", rank: null },
];

function profile(id: string, name: string, role_id: string | null, active = true): ProfileLike {
  return { id, name, role_id, active };
}

describe("isCoordinatorEligible", () => {
  it("allows active leaders and trainers up to the cutoff rank", () => {
    expect(COORDINATOR_MAX_RANK).toBe(8);
    expect(isCoordinatorEligible(true, 6)).toBe(true);
    expect(isCoordinatorEligible(true, 8)).toBe(true);
  });

  it("refuses team members, unranked roles, no role and inactive people", () => {
    expect(isCoordinatorEligible(true, 9)).toBe(false);
    expect(isCoordinatorEligible(true, 10)).toBe(false);
    expect(isCoordinatorEligible(true, null)).toBe(false);
    expect(isCoordinatorEligible(true, undefined)).toBe(false);
    expect(isCoordinatorEligible(false, 2)).toBe(false);
  });
});

describe("coordinatorOptions", () => {
  const profiles = [
    profile("p1", "mariana", "r-tl"),
    profile("p2", "Eric", "r-trainer"),
    profile("p3", "Nathan", "r-tm"),
    profile("p4", "Dana", "r-tl", false),
    profile("p5", "Casey", null),
    profile("p6", "Blake", "r-none"),
    profile("p7", "Alex", "r-lm"),
  ];

  it("lists active leaders and trainers A to Z with their role", () => {
    expect(coordinatorOptions(profiles, ROLES, new Set())).toEqual([
      { id: "p7", name: "Alex", roleName: "Location Manager" },
      { id: "p2", name: "Eric", roleName: "BOH Trainer" },
      { id: "p1", name: "mariana", roleName: "Team Leader" },
    ]);
  });

  it("leaves out people who already hold the tag", () => {
    const ids = coordinatorOptions(profiles, ROLES, new Set(["p1", "p7"])).map((o) => o.id);
    expect(ids).toEqual(["p2"]);
  });

  it("returns nothing for an empty roster", () => {
    expect(coordinatorOptions([], ROLES, new Set())).toEqual([]);
  });
});

describe("coordinatorRows", () => {
  it("names each tagged person with role and sorts A to Z", () => {
    const rows = coordinatorRows(
      [{ user_id: "p2" }, { user_id: "p1" }],
      [profile("p1", "Mariana", "r-tl"), profile("p2", "Eric", "r-trainer")],
      ROLES,
    );
    expect(rows).toEqual([
      { userId: "p2", name: "Eric", roleName: "BOH Trainer", active: true },
      { userId: "p1", name: "Mariana", roleName: "Team Leader", active: true },
    ]);
  });

  it("flags an inactive person, whose tag no longer grants anything", () => {
    const [row] = coordinatorRows([{ user_id: "p4" }], [profile("p4", "Dana", "r-tl", false)], ROLES);
    expect(row).toMatchObject({ name: "Dana", active: false });
  });

  it("still lists a tag whose profile could not be read, so it can be removed", () => {
    const [row] = coordinatorRows([{ user_id: "gone" }], [], ROLES);
    expect(row).toEqual({ userId: "gone", name: "Unknown person", roleName: "No role", active: false });
  });
});
