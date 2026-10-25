import { describe, expect, it } from "vitest";

import { groupPositions, moveInList, trainingStationIds } from "./logic";

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
