import { describe, expect, it } from "vitest";

import { ASSIGN_ACTIONS, SEND_ACTIONS, VIEW_ITEMS, visibleActions } from "./menu-items";

describe("visibleActions", () => {
  it("keeps items with no permission requirement regardless of the grant map", () => {
    expect(visibleActions(ASSIGN_ACTIONS, {})).toHaveLength(ASSIGN_ACTIONS.length);
  });

  it("hides a permissioned action when the grant is missing", () => {
    const result = visibleActions(SEND_ACTIONS, {});
    expect(result).toHaveLength(0);
  });

  it("hides a permissioned action when the grant is explicitly false", () => {
    const result = visibleActions(SEND_ACTIONS, {
      "tokens.award": false,
      "accountability.issue": false,
      "feed.post_broadcast": false,
    });
    expect(result).toHaveLength(0);
  });

  it("shows only the actions whose permission is granted", () => {
    const result = visibleActions(SEND_ACTIONS, { "tokens.award": true });
    expect(result.map((a) => a.key)).toEqual(["recognition"]);
  });

  it("shows every Send action once every permission is granted", () => {
    const result = visibleActions(SEND_ACTIONS, {
      "tokens.award": true,
      "accountability.issue": true,
      "feed.post_broadcast": true,
    });
    expect(result.map((a) => a.key)).toEqual(["recognition", "infraction", "broadcast"]);
  });
});

describe("menu data", () => {
  it("gives every Send/Assign action a unique key and a valid href", () => {
    const all = [...SEND_ACTIONS, ...ASSIGN_ACTIONS];
    const keys = new Set(all.map((a) => a.key));
    expect(keys.size).toBe(all.length);
    for (const action of all) {
      expect(action.href.startsWith("/")).toBe(true);
    }
  });

  it("lists every module exactly once in the View section", () => {
    const keys = VIEW_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      "settings",
      "checklists",
      "setups",
      "breaks",
      "ratings",
      "training",
      "waste",
      "accountability",
      "rewards",
      "tokens",
      "team-feed",
      "people",
      "vendors",
      "maintenance",
      "catering",
      "reporting",
      "notifications",
    ]);
  });
});
