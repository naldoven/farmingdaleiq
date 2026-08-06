import { describe, expect, it } from "vitest";

import {
  NAV_GROUPS,
  PRIMARY_TABS,
  activeNavGroupLabel,
  activeNavHref,
  avatarColor,
  initialsFromName,
  isNavItemActive,
  navPermissionKeys,
  resolveHeader,
  visibleNavGroups,
} from "./page-map";

function allItems(groups: ReturnType<typeof visibleNavGroups>) {
  return groups.flatMap((g) => g.items.map((i) => i.href));
}

describe("resolveHeader", () => {
  it("uses the home variant only for the root route", () => {
    expect(resolveHeader("/")).toMatchObject({
      variant: "home",
      title: "Home",
      showBack: false,
    });
  });

  it("gives the other primary tabs a title header with no back chevron", () => {
    expect(resolveHeader("/team")).toMatchObject({
      variant: "subpage",
      title: "Team",
      showBack: false,
    });
    expect(resolveHeader("/tasks")).toMatchObject({
      variant: "subpage",
      title: "Tasks",
      showBack: false,
    });
    expect(resolveHeader("/menu")).toMatchObject({
      variant: "subpage",
      title: "Menu",
      showBack: false,
    });
  });

  it("titles a top-level sub-page from the page map", () => {
    expect(resolveHeader("/checklists")).toMatchObject({
      variant: "subpage",
      title: "Checklists",
    });
  });

  it("titles an exact nested page and points back at its parent", () => {
    const resolved = resolveHeader("/checklists/templates");
    expect(resolved.variant).toBe("subpage");
    expect(resolved.title).toBe("Templates");
    expect(resolved.backHref).toBe("/checklists");
  });

  it("inherits the section label for an unmapped nested route via longest prefix", () => {
    const resolved = resolveHeader("/training/grid/extra");
    expect(resolved.title).toBe("Station Grid");
    expect(resolved.backHref).toBe("/training/grid");
  });

  it("falls back to the section for an unmapped detail route", () => {
    const resolved = resolveHeader("/maintenance/abc-123");
    expect(resolved.title).toBe("Maintenance");
    expect(resolved.backHref).toBe("/maintenance");
  });

  it("uses the nearest nav destination as the fallback for detail routes without an index parent", () => {
    const resolved = resolveHeader("/catering/orders/order-123");
    expect(resolved.title).toBe("Pipeline");
    expect(resolved.backHref).toBe("/catering");
  });

  it("does not treat the home route as a prefix of every page", () => {
    expect(resolveHeader("/vendors").title).toBe("Vendors");
  });

  it("titles the Menu hub as a sub-page (not the home header variant)", () => {
    expect(resolveHeader("/menu")).toMatchObject({
      variant: "subpage",
      title: "Menu",
      backHref: "/",
    });
  });

  it("marks every non-primary nav destination as backable", () => {
    const primaryHrefs = new Set(PRIMARY_TABS.map((tab) => tab.href));
    for (const item of NAV_GROUPS.flatMap((group) => group.items)) {
      expect(resolveHeader(item.href).showBack, `${item.href} backability`).toBe(
        !primaryHrefs.has(item.href),
      );
    }
  });

  it("does not reveal dormant modules when someone guesses their old URLs", () => {
    expect(resolveHeader("/setups").title).toBe("FarmingdaleIQ");
    expect(resolveHeader("/setups/templates").title).toBe("FarmingdaleIQ");
    expect(resolveHeader("/breaks").title).toBe("FarmingdaleIQ");
  });
});

describe("initialsFromName", () => {
  it("takes up to two initials, uppercased", () => {
    expect(initialsFromName("dana cruz reyes")).toBe("DC");
    expect(initialsFromName("madonna")).toBe("M");
    expect(initialsFromName("  ")).toBe("");
  });
});

describe("avatarColor", () => {
  it("returns a palette entry and is stable per name", () => {
    const a = avatarColor("Jamie");
    const b = avatarColor("Jamie");
    expect(a).toEqual(b);
    expect(a).toHaveProperty("bg");
    expect(a).toHaveProperty("fg");
  });
});

describe("navPermissionKeys", () => {
  it("returns the distinct set of permission keys used to gate nav items", () => {
    const keys = navPermissionKeys();
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
    // A sampling of gates that mirror the destination pages' requirePermission.
    expect(keys).toContain("reports.view");
    expect(keys).toContain("settings.manage");
    expect(keys).toContain("checklists.manage_templates");
    expect(keys).toContain("catering.view");
    expect(keys).not.toContain("setups.view");
    expect(keys).not.toContain("breaks.view");
    // Ungated items contribute no key.
    expect(keys).not.toContain("");
  });
});

describe("visibleNavGroups (S4 nav gating)", () => {
  it("shows every item when no permission set is provided (err toward showing)", () => {
    const hrefs = allItems(visibleNavGroups(null));
    const total = NAV_GROUPS.flatMap((g) => g.items).length;
    expect(hrefs).toHaveLength(total);
    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/settings");
    expect(hrefs).not.toContain("/setups");
    expect(hrefs).not.toContain("/setups/templates");
    expect(hrefs).not.toContain("/breaks");
    expect(NAV_GROUPS.map((group) => group.label)).not.toContain("Setups & Shifts");
  });

  it("keeps ungated items and drops gated items the user lacks", () => {
    // A base "Team Member": has the view/complete keys, lacks admin keys.
    const base = new Set([
      "people.view",
      "checklists.complete",
      "tasks.complete",
      "setups.view",
      "breaks.view",
      "ratings.view",
      "training.view",
      "waste.log",
      "vendors.view",
      "maintenance.request",
      "catering.view",
      "notifications.view",
    ]);
    const hrefs = allItems(visibleNavGroups(base));

    // Ungated items always show.
    expect(hrefs).toContain("/"); // Home
    expect(hrefs).toContain("/menu");
    expect(hrefs).toContain("/team");
    expect(hrefs).toContain("/tokens");
    expect(hrefs).toContain("/accountability");

    // Gated items the user CAN reach show.
    expect(hrefs).toContain("/checklists");
    expect(hrefs).toContain("/catering");
    expect(hrefs).toContain("/training/grid");

    // Dead-end admin items the user CANNOT reach are hidden.
    expect(hrefs).not.toContain("/reports");
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).not.toContain("/settings/discord");
    expect(hrefs).not.toContain("/checklists/templates");
    expect(hrefs).not.toContain("/setups/templates");
  });

  it("drops a group entirely when all its items are gated away", () => {
    // No keys at all: the Reports group (single gated item) disappears.
    const groups = visibleNavGroups(new Set<string>());
    expect(groups.some((g) => g.label === "Reports")).toBe(false);
    // Home (ungated) survives.
    expect(groups.some((g) => g.label === "Home")).toBe(true);
  });

  it("shows an admin every gated item when they hold every key", () => {
    const all = new Set(navPermissionKeys());
    const hrefs = allItems(visibleNavGroups(all));
    const total = NAV_GROUPS.flatMap((g) => g.items).length;
    expect(hrefs).toHaveLength(total);
  });
});

describe("isNavItemActive", () => {
  it("matches the exact route", () => {
    expect(isNavItemActive("/training", "/training")).toBe(true);
  });

  it("matches a route nested under the item", () => {
    expect(isNavItemActive("/training", "/training/grid")).toBe(true);
    expect(isNavItemActive("/maintenance", "/maintenance/abc-123")).toBe(true);
  });

  it("does not match a sibling route that merely shares a prefix string", () => {
    expect(isNavItemActive("/team", "/teams")).toBe(false);
    expect(isNavItemActive("/setups", "/setups-archive")).toBe(false);
  });

  it("only matches home exactly, so Home never lights up everywhere", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/vendors")).toBe(false);
  });
});

describe("activeNavHref", () => {
  it("picks the deepest match so an ancestor page is not also current", () => {
    // /catering/confirm matches "/catering" by prefix too; only the exact page
    // may be highlighted, or both Pipeline and Confirmation Calls go red.
    expect(activeNavHref("/catering/confirm")).toBe("/catering/confirm");
    expect(activeNavHref("/checklists/templates")).toBe("/checklists/templates");
    expect(activeNavHref("/people/org-chart")).toBe("/people/org-chart");
  });

  it("falls back to the section landing page for an unmapped detail route", () => {
    expect(activeNavHref("/catering/orders/abc-123")).toBe("/catering");
    expect(activeNavHref("/maintenance/abc-123")).toBe("/maintenance");
  });

  it("matches the landing page itself when that is the route", () => {
    expect(activeNavHref("/catering")).toBe("/catering");
  });

  it("returns null when nothing in the map matches", () => {
    expect(activeNavHref("/nowhere")).toBeNull();
  });

  it("never returns home for a non-home route", () => {
    expect(activeNavHref("/vendors")).toBe("/vendors");
    expect(activeNavHref("/")).toBe("/");
  });
});

describe("activeNavGroupLabel", () => {
  it("finds the group holding a top-level route", () => {
    expect(activeNavGroupLabel("/vendors")).toBe("Vendors");
    expect(activeNavGroupLabel("/")).toBe("Home");
  });

  it("finds the group holding a nested route", () => {
    expect(activeNavGroupLabel("/checklists/templates")).toBe("Checklists");
    expect(activeNavGroupLabel("/settings/discord")).toBe("Settings");
  });

  it("prefers the longest matching href when two items overlap", () => {
    // Both /people and /people/org-chart match; the longer one wins, and both
    // happen to sit in People — the tie-break matters where they differ.
    expect(activeNavGroupLabel("/people/org-chart")).toBe("People");
    expect(activeNavGroupLabel("/training/grid")).toBe("Training");
  });

  it("still resolves an unmapped detail route via its section prefix", () => {
    expect(activeNavGroupLabel("/maintenance/abc-123")).toBe("Maintenance");
  });

  it("returns null when nothing in the map matches", () => {
    expect(activeNavGroupLabel("/nowhere")).toBeNull();
  });

  it("only considers the groups it is given, so gated-away sections never win", () => {
    const visible = visibleNavGroups(new Set<string>());
    // /reports is gated away for a user with no keys.
    expect(activeNavGroupLabel("/reports", visible)).toBeNull();
    expect(activeNavGroupLabel("/reports")).toBe("Reports");
  });
});

describe("nav group icons", () => {
  it("gives every group an icon so the collapsed rail can render it", () => {
    for (const group of NAV_GROUPS) {
      expect(group.icon, `${group.label} is missing an icon`).toBeTruthy();
    }
  });
});
