import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_NAV_PREFS,
  expandNavToGroup,
  isNavGroupOpen,
  resetNavPrefsCacheForTests,
  setNavCollapsed,
  setNavGroupOpen,
} from "./nav-prefs";

const STORAGE_KEY = "fiq.nav.prefs.v1";

/** Reads what the store actually persisted, not just its in-memory cache. */
function stored() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
}

beforeEach(() => {
  window.localStorage.clear();
  resetNavPrefsCacheForTests();
});

afterEach(() => {
  window.localStorage.clear();
  resetNavPrefsCacheForTests();
});

describe("isNavGroupOpen", () => {
  it("opens the group holding the current route by default", () => {
    expect(isNavGroupOpen(DEFAULT_NAV_PREFS, "Training", "Training")).toBe(true);
  });

  it("leaves every other group closed by default", () => {
    expect(isNavGroupOpen(DEFAULT_NAV_PREFS, "Catering", "Training")).toBe(false);
  });

  it("opens a group the user explicitly opened, even away from that section", () => {
    const prefs = { ...DEFAULT_NAV_PREFS, openGroups: ["Catering"] };
    expect(isNavGroupOpen(prefs, "Catering", "Training")).toBe(true);
  });

  it("lets an explicit close beat the active-section default", () => {
    // The whole reason prefs track opened and closed separately: without this,
    // the section you are standing in could never be collapsed.
    const prefs = { ...DEFAULT_NAV_PREFS, closedGroups: ["Training"] };
    expect(isNavGroupOpen(prefs, "Training", "Training")).toBe(false);
  });

  it("lets an explicit close beat an explicit open", () => {
    const prefs = {
      ...DEFAULT_NAV_PREFS,
      openGroups: ["Catering"],
      closedGroups: ["Catering"],
    };
    expect(isNavGroupOpen(prefs, "Catering", null)).toBe(false);
  });

  it("closes everything when no group is active", () => {
    expect(isNavGroupOpen(DEFAULT_NAV_PREFS, "Training", null)).toBe(false);
  });
});

describe("setNavGroupOpen", () => {
  it("persists an opened group and clears any prior close", () => {
    setNavGroupOpen("Catering", false);
    setNavGroupOpen("Catering", true);
    expect(stored().openGroups).toContain("Catering");
    expect(stored().closedGroups).not.toContain("Catering");
  });

  it("persists a closed group and clears any prior open", () => {
    setNavGroupOpen("Catering", true);
    setNavGroupOpen("Catering", false);
    expect(stored().closedGroups).toContain("Catering");
    expect(stored().openGroups).not.toContain("Catering");
  });

  it("does not duplicate a label when set open twice", () => {
    setNavGroupOpen("Catering", true);
    setNavGroupOpen("Catering", true);
    expect(stored().openGroups).toEqual(["Catering"]);
  });

  it("leaves the collapsed rail setting alone", () => {
    setNavCollapsed(true);
    setNavGroupOpen("Catering", true);
    expect(stored().collapsed).toBe(true);
  });
});

describe("setNavCollapsed", () => {
  it("persists the rail state without disturbing open groups", () => {
    setNavGroupOpen("Training", true);
    setNavCollapsed(true);
    expect(stored().collapsed).toBe(true);
    expect(stored().openGroups).toEqual(["Training"]);
    setNavCollapsed(false);
    expect(stored().collapsed).toBe(false);
  });
});

describe("expandNavToGroup", () => {
  it("expands the rail and opens the group in one write", () => {
    setNavCollapsed(true);
    setNavGroupOpen("Catering", false);

    expandNavToGroup("Catering");

    expect(stored().collapsed).toBe(false);
    expect(stored().openGroups).toContain("Catering");
    expect(stored().closedGroups).not.toContain("Catering");
  });
});

describe("stored value handling", () => {
  it("falls back to defaults when the stored value is corrupt", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    resetNavPrefsCacheForTests();
    // A write reads the current snapshot first; defaults means it does not throw.
    setNavCollapsed(true);
    expect(stored()).toEqual({ collapsed: true, openGroups: [], closedGroups: [] });
  });

  it("drops non-string entries from a hand-edited group list", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ collapsed: false, openGroups: ["Training", 7, null], closedGroups: "nope" }),
    );
    resetNavPrefsCacheForTests();
    setNavCollapsed(false);
    expect(stored().openGroups).toEqual(["Training"]);
    expect(stored().closedGroups).toEqual([]);
  });
});
