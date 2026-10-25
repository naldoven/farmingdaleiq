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

  it("gates every money area on a manage-level key, never a shift-leader key", () => {
    // Guardrail from docs/STORE-SETUP.md: costs, prices, and token amounts
    // need the module's manage permission. A `.log`, `.view`, `.claim`, or
    // `.complete` key here would let a shift leader change money values.
    for (const area of STORE_SETUP_AREAS.filter((a) => a.money)) {
      expect(area.editPermission.endsWith(".manage")).toBe(true);
    }
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
