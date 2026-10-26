import { describe, expect, it } from "vitest";

import {
  ASSIGN_ACTIONS,
  MENU_SECTIONS,
  SEND_ACTIONS,
  VIEW_ITEMS,
  groupViewItems,
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

  it("sends Broadcast to the feed page, where the form lives", () => {
    expect(SEND_ACTIONS.find((a) => a.key === "broadcast")?.href).toBe("/team/feed");
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
      "cleaning.complete": true,
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
      "cleaning-today",
      "cleaning-week",
      "cleaning",
      "cleaning-walkthrough",
      "accountability",
      "rewards",
      "tokens",
      "team-feed",
      "people",
      "vendors",
      "maintenance",
      "equipment",
      "catering",
      "reporting",
      "notifications",
    ]);
  });

  it("files every module under a known section", () => {
    for (const item of VIEW_ITEMS) {
      expect(MENU_SECTIONS, `${item.key} has an unknown section`).toContain(item.section);
    }
  });

  it("puts Catering with the daily operating tools", () => {
    expect(VIEW_ITEMS.find((item) => item.key === "catering")?.section).toBe(
      "Daily Ops",
    );
  });

  it("puts every Cleaning screen under Daily Ops with the same icon, gated by cleaning.complete", () => {
    const cleaning = VIEW_ITEMS.filter((item) => item.key.startsWith("cleaning"));
    expect(cleaning.map((item) => [item.key, item.href])).toEqual([
      ["cleaning-today", "/cleaning"],
      ["cleaning-week", "/cleaning/week"],
      ["cleaning", "/cleaning/items"],
      ["cleaning-walkthrough", "/cleaning/walkthrough"],
    ]);
    for (const item of cleaning) {
      expect(item.section, item.key).toBe("Daily Ops");
      expect(item.icon, item.key).toBe("cleaning");
    }
    const without = visibleViewItems(VIEW_ITEMS, {}).map((item) => item.key);
    const withKey = visibleViewItems(VIEW_ITEMS, { "cleaning.complete": true }).map((item) => item.key);
    for (const item of cleaning) {
      expect(without, item.key).not.toContain(item.key);
      expect(withKey, item.key).toContain(item.key);
    }
  });

  it("keeps Equipment reachable from the mobile Menu hub", () => {
    expect(VIEW_ITEMS.find((item) => item.key === "equipment")).toMatchObject({
      href: "/maintenance/equipment",
      section: "Operations",
    });
  });
});

describe("groupViewItems", () => {
  it("keeps the grouped data serializable across the Server-to-Client boundary", () => {
    const grouped = groupViewItems(VIEW_ITEMS);
    const icons = grouped.flatMap((group) => group.items.map((item) => item.icon));

    // MenuPage is a Server Component and MenuViewSections is a Client
    // Component. React cannot serialize component functions in their props.
    expect(icons.every((icon) => typeof icon === "string")).toBe(true);
  });

  it("buckets every item, losing none", () => {
    const grouped = groupViewItems(VIEW_ITEMS);
    const keys = grouped.flatMap((g) => g.items.map((i) => i.key));
    expect(new Set(keys)).toEqual(new Set(VIEW_ITEMS.map((i) => i.key)));
    expect(keys).toHaveLength(VIEW_ITEMS.length);
  });

  it("returns sections in MENU_SECTIONS order regardless of VIEW_ITEMS order", () => {
    // VIEW_ITEMS opens with "settings" (an Admin item), so a naive
    // first-seen ordering would put Admin first instead of last.
    const grouped = groupViewItems(VIEW_ITEMS);
    expect(grouped.map((g) => g.section)).toEqual([...MENU_SECTIONS]);
  });

  it("turns the module list into a handful of headings", () => {
    const grouped = groupViewItems(VIEW_ITEMS);
    expect(grouped.length).toBeLessThanOrEqual(5);
  });

  it("drops a section whose modules are all gated away", () => {
    // No permissions at all: Admin's three items (settings, reporting,
    // notifications) are every one of them gated, so the heading disappears.
    const grouped = groupViewItems(visibleViewItems(VIEW_ITEMS, {}));
    expect(grouped.map((g) => g.section)).not.toContain("Admin");
    // Recognition is entirely ungated, so it survives.
    expect(grouped.map((g) => g.section)).toContain("Recognition");
  });

  it("keeps a partially gated section with only its reachable modules", () => {
    const grouped = groupViewItems(
      visibleViewItems(VIEW_ITEMS, { "settings.manage": true }),
    );
    const admin = grouped.find((g) => g.section === "Admin");
    expect(admin?.items.map((i) => i.key)).toEqual(["settings"]);
  });

  it("returns nothing for an empty item list", () => {
    expect(groupViewItems([])).toEqual([]);
  });
});
