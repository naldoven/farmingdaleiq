import { describe, expect, it } from "vitest";

import {
  ASSIGN_ACTIONS,
  SEND_ACTIONS,
  VIEW_ITEMS,
  visibleActions,
  visibleViewItems,
} from "./menu-items";

/** The four View items intentionally left ungated (no page-map permission). */
const UNGATED_VIEW_KEYS = ["accountability", "rewards", "tokens", "team-feed"];

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

describe("visibleViewItems", () => {
  it("hides a gated View item when its permission is missing", () => {
    const keys = visibleViewItems(VIEW_ITEMS, {}).map((i) => i.key);
    expect(keys).not.toContain("settings"); // /settings -> settings.manage
    expect(keys).not.toContain("training"); // /training -> training.view
    expect(keys).not.toContain("reporting"); // /reports -> reports.view
  });

  it("shows a gated View item once its permission is granted", () => {
    const keys = visibleViewItems(VIEW_ITEMS, { "settings.manage": true }).map((i) => i.key);
    expect(keys).toContain("settings");
    // A different gate stays hidden.
    expect(keys).not.toContain("training");
  });

  it("always shows the ungated View items even with an empty grant set", () => {
    const keys = visibleViewItems(VIEW_ITEMS, {}).map((i) => i.key);
    for (const ungated of UNGATED_VIEW_KEYS) {
      expect(keys).toContain(ungated);
    }
  });

  it("shows every View item once all gated permissions are granted", () => {
    const allGranted = {
      "settings.manage": true,
      "checklists.complete": true,
      "setups.view": true,
      "breaks.view": true,
      "ratings.view": true,
      "training.view": true,
      "waste.log": true,
      "people.view": true,
      "vendors.view": true,
      "maintenance.request": true,
      "catering.view": true,
      "reports.view": true,
      "notifications.view": true,
    } as const;
    expect(visibleViewItems(VIEW_ITEMS, allGranted)).toHaveLength(VIEW_ITEMS.length);
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
