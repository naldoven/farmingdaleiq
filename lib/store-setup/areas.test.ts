import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ALL_PERMISSION_KEYS } from "@/lib/auth/permissions";
import { APP_FEATURES } from "@/lib/features";
import {
  CODE_DEFAULTS,
  STORE_SETUP_AREAS,
  STORE_SETUP_AREA_KEYS,
  findStoreSetupArea,
  isStoreSetupAreaKey,
  summarizeStoreSetup,
} from "./areas";

describe("STORE_SETUP_AREAS registry", () => {
  it("has exactly one entry per key, in key order", () => {
    expect(STORE_SETUP_AREAS.map((a) => a.key)).toEqual([...STORE_SETUP_AREA_KEYS]);
  });

  it("gates every area on a real permission key", () => {
    for (const area of STORE_SETUP_AREAS) {
      expect(ALL_PERMISSION_KEYS).toContain(area.editPermission);
    }
  });

  it("gates each money area on its module's exact manage key", () => {
    // docs/STORE-SETUP.md ("Who can change money values today"): costs, prices,
    // and token amounts are edited with the module's own manage key. Pin the
    // exact key per area so a swap to another .manage key (or to a .log,
    // .view, .claim, or .complete key) fails here. This does NOT claim a shift
    // leader is locked out: the seeded Team Leader holds catering.manage and
    // the seeded Shift Supervisor holds waste.manage.
    const expected = {
      waste_items: "waste.manage",
      token_rules: "tokens.manage",
      rewards: "rewards.manage",
      catering_menu: "catering.manage",
    } as const;
    const moneyAreas = STORE_SETUP_AREAS.filter((a) => a.money);
    expect(moneyAreas.map((a) => a.key).sort()).toEqual(Object.keys(expected).sort());
    for (const area of moneyAreas) {
      expect(area.editPermission, area.key).toBe(expected[area.key as keyof typeof expected]);
    }
  });

  it("audits the checklist templates and catering menu accurately", () => {
    // Regression for the first audit: it called the checklist inventory real
    // (only 18 of 67 names were ever seeded, all inactive drafts) and called
    // the catering menu five invented items (it holds the real priced catalog).
    const checklists = findStoreSetupArea("checklist_templates");
    expect(checklists.description).toContain("18 of the 67");
    expect(checklists.editPermission).toBe("checklists.manage_templates");
    const catering = findStoreSetupArea("catering_menu");
    expect(catering.description).toContain("prices are real");
    expect(catering.description).toContain("empty scaling rules");
    expect(catering.description).not.toContain("made-up");
  });

  it("links every editor to a route that exists and is switched on", () => {
    // A link to a route that never existed shipped once and 404 would be the
    // result here too (rules/codex-agreement.md). The Setups module is off in
    // lib/features.ts, so its /setups/templates editor is not acceptable
    // either: the layout returns notFound for the whole tree.
    for (const area of STORE_SETUP_AREAS) {
      if (area.href === null) continue;
      const route = area.href.split("?")[0];
      expect(route.startsWith("/setups") && !APP_FEATURES.setups, `${area.key} links into a dormant module`).toBe(false);
      expect(route.startsWith("/breaks") && !APP_FEATURES.breaks, `${area.key} links into a dormant module`).toBe(false);
      const pageFile = path.join(process.cwd(), "app", "(app)", ...route.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(pageFile), `${area.key} links to ${route}, which has no page`).toBe(true);
    }
  });

  it("names a source for every area so the audit trail survives", () => {
    for (const area of STORE_SETUP_AREAS) {
      expect(area.source.length).toBeGreaterThan(0);
    }
  });

  it("names the file for every code default", () => {
    for (const item of CODE_DEFAULTS) {
      expect(item.where).toMatch(/\.(ts|sql)\b/);
    }
  });
});

describe("isStoreSetupAreaKey", () => {
  it("accepts registry keys and rejects anything else", () => {
    expect(isStoreSetupAreaKey("waste_items")).toBe(true);
    expect(isStoreSetupAreaKey("Waste_Items")).toBe(false);
    expect(isStoreSetupAreaKey("")).toBe(false);
  });
});

describe("findStoreSetupArea", () => {
  it("returns the matching entry", () => {
    expect(findStoreSetupArea("token_rules").href).toBe("/tokens");
  });
});

describe("summarizeStoreSetup", () => {
  it("marks every area default when nothing is confirmed", () => {
    const summary = summarizeStoreSetup(new Set());
    expect(summary.confirmedCount).toBe(0);
    expect(summary.defaultCount).toBe(STORE_SETUP_AREAS.length);
    expect(summary.rows.every((r) => r.status === "default")).toBe(true);
  });

  it("flips only the confirmed keys and keeps registry order", () => {
    const summary = summarizeStoreSetup(new Set(["rewards", "discord"]));
    expect(summary.confirmedCount).toBe(2);
    expect(summary.rows.map((r) => r.key)).toEqual([...STORE_SETUP_AREA_KEYS]);
    expect(summary.rows.find((r) => r.key === "rewards")?.status).toBe("confirmed");
    expect(summary.rows.find((r) => r.key === "token_rules")?.status).toBe("default");
  });

  it("ignores keys that are no longer in the registry", () => {
    const summary = summarizeStoreSetup(new Set(["retired_area"]));
    expect(summary.confirmedCount).toBe(0);
    expect(summary.rows).toHaveLength(STORE_SETUP_AREAS.length);
  });
});
