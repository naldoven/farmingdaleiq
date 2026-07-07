import { describe, expect, it } from "vitest";

import { completedCount, cycleStation, isRoadmapComplete, phaseAverage, type StationState } from "./logic";

describe("cycleStation", () => {
  it("goes not_started -> in_training -> scored 1..5 -> not_started", () => {
    let state: StationState = { status: "not_started", score: null };
    state = cycleStation(state);
    expect(state).toEqual({ status: "in_training", score: null });

    state = cycleStation(state);
    expect(state).toEqual({ status: "scored", score: 1 });

    for (let expected = 2; expected <= 5; expected++) {
      state = cycleStation(state);
      expect(state).toEqual({ status: "scored", score: expected });
    }

    state = cycleStation(state);
    expect(state).toEqual({ status: "not_started", score: null });
  });
});

describe("phaseAverage", () => {
  it("averages only scored stations", () => {
    expect(phaseAverage([3, 4, null, 5])).toBe(4);
  });
  it("is null when nothing is scored", () => {
    expect(phaseAverage([null, null])).toBeNull();
  });
});

describe("completedCount", () => {
  it("counts only 'scored' statuses", () => {
    expect(completedCount(["scored", "in_training", "scored", "not_started"])).toBe(2);
  });
});

describe("isRoadmapComplete", () => {
  it("is true only when every station is scored", () => {
    expect(isRoadmapComplete(21, 21)).toBe(true);
    expect(isRoadmapComplete(21, 20)).toBe(false);
    expect(isRoadmapComplete(0, 0)).toBe(false);
  });
});
