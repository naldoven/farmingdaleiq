import { describe, expect, it } from "vitest";

import { buildRubricRows } from "./logic";

describe("buildRubricRows", () => {
  const positions = [
    { id: "p1", name: "Register 1", group_id: "g1" },
    { id: "p2", name: "Breading", group_id: null },
  ];
  const groups = [{ id: "g1", name: "Front Counter" }];

  it("fills blank categories for a position with no rubric row", () => {
    const rows = buildRubricRows(positions, groups, []);
    expect(rows[0]).toEqual({
      id: "p1",
      name: "Register 1",
      groupName: "Front Counter",
      categories: ["", "", "", ""],
    });
    expect(rows[1].groupName).toBeNull();
  });

  it("maps a rubric row onto its position and nulls to blanks", () => {
    const rows = buildRubricRows(positions, groups, [
      { position_id: "p1", category_1: "Speed", category_2: "Accuracy", category_3: null, category_4: null },
      { position_id: null, category_1: "Orphan", category_2: null, category_3: null, category_4: null },
    ]);
    expect(rows[0].categories).toEqual(["Speed", "Accuracy", "", ""]);
    expect(rows[1].categories).toEqual(["", "", "", ""]);
  });

  it("keeps the incoming position order", () => {
    const rows = buildRubricRows(positions, groups, []);
    expect(rows.map((r) => r.id)).toEqual(["p1", "p2"]);
  });
});
