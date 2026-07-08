import { describe, expect, it } from "vitest";

import {
  avatarColor,
  initialsFromName,
  resolveHeader,
} from "./page-map";

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
