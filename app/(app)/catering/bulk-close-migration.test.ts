import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANCELLED_STAGE,
  ORDER_STAGES,
  ORDER_STAGE_LABELS,
  RESTORE_STAGES,
  BULK_CLOSE_OUTCOMES,
} from "@/app/(app)/catering/logic";

/**
 * The bulk close migration (supabase/migrations/20261026020000_catering_bulk_close.sql)
 * recreates the stage guard trigger and adds catering_bulk_close. Both keep
 * their own copies of the stage order, the labels and the outcome names,
 * because SQL cannot import the TypeScript constants. These tests read the
 * file and fail when it drifts from logic.ts, the same way
 * stage-guard-migration.test.ts covers the original guard.
 */

const MIGRATION = readFileSync(
  path.resolve(__dirname, "..", "..", "..", "supabase", "migrations", "20261026020000_catering_bulk_close.sql"),
  "utf8",
);

const SQL_ONLY = MIGRATION.replace(/--.*$/gm, "");

/** Every `<name> constant text[] := array[...]` in the file, as string lists. */
function sqlTextArrays(name: string): string[][] {
  return [...MIGRATION.matchAll(new RegExp(`${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`, "gi"))].map(
    (match) => [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1]),
  );
}

function sqlTextConstants(name: string): string[] {
  return [...MIGRATION.matchAll(new RegExp(`${name}\\s+constant\\s+text\\s*:=\\s*'([^']*)'`, "gi"))].map(
    (match) => match[1],
  );
}

/** Each `stage_labels constant jsonb := '{...}'` block, parsed. */
function sqlLabelMaps(): Record<string, string>[] {
  return [...MIGRATION.matchAll(/stage_labels\s+constant\s+jsonb\s*:=\s*'(\{[\s\S]*?\})'/gi)].map(
    (match) => JSON.parse(match[1]) as Record<string, string>,
  );
}

describe("catering bulk close migration matches logic.ts", () => {
  it("keeps the trigger's pipeline order, restore targets and cancelled stage", () => {
    expect(sqlTextArrays("flow_stages")).toEqual([[...ORDER_STAGES]]);
    expect(sqlTextArrays("restore_stages")).toEqual([[...RESTORE_STAGES]]);
    expect(sqlTextConstants("cancelled_stage")).toEqual([CANCELLED_STAGE]);
    expect(sqlTextConstants("closed_stage")).toEqual([ORDER_STAGES[ORDER_STAGES.length - 1]]);
  });

  it("names stages the way the app does, in both functions", () => {
    const maps = sqlLabelMaps();
    expect(maps).toHaveLength(2);
    for (const map of maps) expect(map).toEqual(ORDER_STAGE_LABELS);
  });

  it("only lets a manager close in one step when the stored event date is already past", () => {
    expect(SQL_ONLY).toMatch(/public\.has_permission\('catering\.override'\) and public\.has_permission\('catering\.manage'\)/);
    expect(SQL_ONLY).toMatch(/old\.stage <> closed_stage/);
    expect(SQL_ONLY).toMatch(/new\.stage = closed_stage/);
    expect(SQL_ONLY).toMatch(/old\.event_date < \(now\(\) at time zone store_time_zone\)::date/);
    // The shortcut sits inside the manager branch, after the move-back rule.
    const managerBranch = SQL_ONLY.indexOf("if is_manager then");
    const shortcut = SQL_ONLY.indexOf("old.stage <> closed_stage");
    const branchEnd = SQL_ONLY.indexOf("raise exception 'A catering order cannot move from % to %.'");
    expect(managerBranch).toBeGreaterThan(-1);
    expect(shortcut).toBeGreaterThan(managerBranch);
    expect(shortcut).toBeLessThan(branchEnd);
  });

  it("keeps the trigger on inserts and stage updates, invoker rights, off the Data API", () => {
    expect(MIGRATION).toMatch(/before insert or update of stage on public\.catering_orders/i);
    expect(SQL_ONLY).not.toMatch(/security definer/i);
    expect(MIGRATION).toMatch(
      /revoke all on function public\.enforce_catering_stage_transition\(\) from public, anon, authenticated;/i,
    );
    expect(MIGRATION).not.toMatch(/grant execute on function public\.enforce_catering_stage_transition/i);
  });

  it("exposes catering_bulk_close to signed-in users only, with the same permission pair", () => {
    expect(MIGRATION).toMatch(/grant execute on function public\.catering_bulk_close\(uuid\[\], text\) to authenticated;/i);
    expect(MIGRATION).toMatch(/revoke all on function public\.catering_bulk_close\(uuid\[\], text\) from public, anon;/i);
    const fn = SQL_ONLY.slice(SQL_ONLY.indexOf("create or replace function public.catering_bulk_close"));
    expect(fn).toMatch(/security invoker/i);
    expect(fn).toMatch(/if not \(public\.has_permission\('catering\.override'\) and public\.has_permission\('catering\.manage'\)\)/);
    expect(fn).toMatch(/for update/);
  });

  it("returns exactly the outcomes the summary helper knows", () => {
    const fn = SQL_ONLY.slice(SQL_ONLY.indexOf("create or replace function public.catering_bulk_close"));
    const outcomes = [...fn.matchAll(/outcome := '([a-z_]+)'/g)].map((match) => match[1]);
    expect(new Set(outcomes)).toEqual(new Set(BULK_CLOSE_OUTCOMES));
  });

  it("writes an audit row per closed order that never reaches Discord, and no follow-up", () => {
    const fn = SQL_ONLY.slice(SQL_ONLY.indexOf("create or replace function public.catering_bulk_close"));
    expect(fn).toMatch(/insert into public\.app_events \(event_key, payload\)/);
    expect(fn).toMatch(/'catering_stage_change'/);
    expect(fn).toMatch(/'override', 'bulk_close'/);
    expect(fn).toMatch(/'notify_discord', false/);
    expect(fn).not.toMatch(/catering_followups/);
  });
});
