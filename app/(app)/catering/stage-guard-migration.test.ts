import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CANCELLED_STAGE, ORDER_STAGES, RESTORE_STAGES } from "@/app/(app)/catering/logic";

/**
 * The database trigger that backs up the catering stage rules
 * (supabase/migrations/20261013010000_catering_stage_transition_guard.sql)
 * keeps its own copy of the stage order, because SQL cannot import the
 * TypeScript constants. These tests read the migration and fail when its
 * lists drift from logic.ts, so a stage added or reordered in one place but
 * not the other is caught before it reaches the database.
 */

const MIGRATION = readFileSync(
  path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "supabase",
    "migrations",
    "20261013010000_catering_stage_transition_guard.sql",
  ),
  "utf8",
);

/** The quoted values of `<name> constant text[] := array[...]` in the trigger body. */
function sqlTextArray(name: string): string[] {
  const match = MIGRATION.match(new RegExp(`${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`, "i"));
  if (!match) throw new Error(`${name} not found in the stage guard migration`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1]);
}

function sqlTextConstant(name: string): string {
  const match = MIGRATION.match(new RegExp(`${name}\\s+constant\\s+text\\s*:=\\s*'([^']*)'`, "i"));
  if (!match) throw new Error(`${name} not found in the stage guard migration`);
  return match[1];
}

describe("catering stage guard migration matches logic.ts", () => {
  it("uses the same pipeline order as ORDER_STAGES", () => {
    expect(sqlTextArray("flow_stages")).toEqual([...ORDER_STAGES]);
  });

  it("uses the same restore targets as RESTORE_STAGES", () => {
    expect(sqlTextArray("restore_stages")).toEqual([...RESTORE_STAGES]);
  });

  it("uses the same cancelled stage as CANCELLED_STAGE", () => {
    expect(sqlTextConstant("cancelled_stage")).toBe(CANCELLED_STAGE);
  });

  it("starts user-created orders in the first pipeline stage", () => {
    expect(MIGRATION).toMatch(/if new\.stage = '([^']+)' then/);
    expect(MIGRATION.match(/if new\.stage = '([^']+)' then/)?.[1]).toBe(ORDER_STAGES[0]);
  });

  it("guards inserts and stage updates, and keeps the function off the Data API", () => {
    expect(MIGRATION).toMatch(/before insert or update of stage on public\.catering_orders/i);
    expect(MIGRATION).toMatch(/security invoker/i);
    expect(MIGRATION).toMatch(
      /revoke all on function public\.enforce_catering_stage_transition\(\) from public, anon, authenticated;/i,
    );
    expect(MIGRATION).not.toMatch(/grant execute on function public\.enforce_catering_stage_transition/i);
  });

  it("needs both catering.override and catering.manage for a move back or a restore", () => {
    expect(MIGRATION).toMatch(
      /has_permission\('catering\.override'\) and public\.has_permission\('catering\.manage'\)/,
    );
  });
});
