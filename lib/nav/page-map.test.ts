import { describe, expect, it } from "vitest";

import {
  NAV_GROUPS,
  avatarColor,
  initialsFromName,
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
