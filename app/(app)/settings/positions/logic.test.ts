import { describe, expect, it } from "vitest";

import {
  deleteRefusalMessage,
  describeHistory,
  groupPositions,
  hasHistory,
  moveInList,
  shouldOfferDefaultList,
  trainingStationIds,
} from "./logic";

const groups = [
  { id: "g2", name: "Kitchen", sort: 2 },
  { id: "g1", name: "Front Counter", sort: 1 },
];

const positions = [
  { id: "p3", group_id: "g1", name: "Register 2", sort: 1, is_rateable: true },
  { id: "p1", group_id: "g1", name: "Register 1", sort: 0, is_rateable: true },
  { id: "p4", group_id: "g2", name: "Breading", sort: 0, is_rateable: true },
  { id: "p5", group_id: null, name: "Orientation", sort: 0, is_rateable: false },
  { id: "p2", group_id: "g1", name: "Beverage", sort: 1, is_rateable: true },
];

describe("groupPositions", () => {
  it("orders groups by sort and positions by sort then name", () => {
    const { grouped } = groupPositions(groups, positions);
    expect(grouped.map((g) => g.group.id)).toEqual(["g1", "g2"]);
    // p2 and p3 tie on sort 1; name breaks the tie so the order is stable.
    expect(grouped[0].positions.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(grouped[1].positions.map((p) => p.id)).toEqual(["p4"]);
  });

  it("returns ungrouped positions separately", () => {
    const { ungrouped } = groupPositions(groups, positions);
    expect(ungrouped.map((p) => p.id)).toEqual(["p5"]);
  });

  it("keeps an empty group so the editor can show it", () => {
    const { grouped } = groupPositions([{ id: "g9", name: "Empty", sort: 0 }], []);
    expect(grouped).toEqual([{ group: { id: "g9", name: "Empty", sort: 0 }, positions: [] }]);
  });
});

describe("moveInList", () => {
  it("moves an id up and down", () => {
    expect(moveInList(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("does nothing at either end or for an unknown id", () => {
    expect(moveInList(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveInList(["a", "b"], "b", 1)).toEqual(["a", "b"]);
    expect(moveInList(["a", "b"], "zzz", 1)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const input = ["a", "b"];
    moveInList(input, "a", 1);
    expect(input).toEqual(["a", "b"]);
  });
});

describe("trainingStationIds", () => {
  it("collects the position ids a roadmap references", () => {
    expect(trainingStationIds([{ position_id: "p5" }, { position_id: "p5" }, { position_id: null }])).toEqual(
      new Set(["p5"]),
    );
  });
});

describe("shouldOfferDefaultList", () => {
  it("offers the Avondale list only when there are no positions", () => {
    expect(shouldOfferDefaultList(0)).toBe(true);
    expect(shouldOfferDefaultList(1)).toBe(false);
    expect(shouldOfferDefaultList(19)).toBe(false);
  });

  it("stays hidden after the seed groups are renamed, because positions still exist", () => {
    // Regression: the banner used to key off the five seed group names, so a
    // rename brought it back and one tap added 19 duplicate positions.
    const renamedGroups = [{ id: "g1", name: "Counter", sort: 0 }];
    const positions = [{ id: "p1", group_id: "g1", name: "Register 1", sort: 0, is_rateable: true }];
    expect(renamedGroups.length).toBeGreaterThan(0);
    expect(shouldOfferDefaultList(positions.length)).toBe(false);
  });
});

describe("hasHistory", () => {
  it("is true when any one count is above zero", () => {
    expect(hasHistory({ ratings: 0, enrollments: 0, itemRecords: 0 })).toBe(false);
    expect(hasHistory({ ratings: 1, enrollments: 0, itemRecords: 0 })).toBe(true);
    expect(hasHistory({ ratings: 0, enrollments: 1, itemRecords: 0 })).toBe(true);
    expect(hasHistory({ ratings: 0, enrollments: 0, itemRecords: 1 })).toBe(true);
  });
});

describe("describeHistory", () => {
  it("names only what exists, with plurals", () => {
    expect(describeHistory({ ratings: 1, enrollments: 0, itemRecords: 0 })).toBe("1 rating");
    expect(describeHistory({ ratings: 12, enrollments: 0, itemRecords: 3 })).toBe(
      "12 ratings and 3 passport item records",
    );
    expect(describeHistory({ ratings: 12, enrollments: 1, itemRecords: 40 })).toBe(
      "12 ratings, 1 trainee passport enrollment, and 40 passport item records",
    );
  });
});

describe("deleteRefusalMessage", () => {
  it("returns null when there is nothing to lose", () => {
    expect(deleteRefusalMessage({ kind: "position", name: "Curbside" }, { ratings: 0, enrollments: 0, itemRecords: 0 })).toBeNull();
  });

  it("names the position, what exists, and the hide-from-Ratings alternative", () => {
    const message = deleteRefusalMessage(
      { kind: "position", name: "Register 1" },
      { ratings: 12, enrollments: 3, itemRecords: 0 },
    );
    expect(message).toContain('"Register 1"');
    expect(message).toContain("12 ratings and 3 trainee passport enrollments");
    expect(message).toContain("Show as a column on the Ratings matrix");
  });

  it("says the group's positions hold the history", () => {
    const message = deleteRefusalMessage(
      { kind: "group", name: "Kitchen" },
      { ratings: 0, enrollments: 0, itemRecords: 2 },
    );
    expect(message).toContain('group "Kitchen"');
    expect(message).toContain("its positions have 2 passport item records");
  });
});
