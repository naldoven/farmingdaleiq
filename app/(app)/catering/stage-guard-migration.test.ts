import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CANCELLED_STAGE, ORDER_STAGES, ORDER_STAGE_LABELS, RESTORE_STAGES } from "@/app/(app)/catering/logic";

/**
 * The database trigger that backs up the catering stage rules keeps its own
 * copy of the stage order and the stage labels, because SQL cannot import the
 * TypeScript constants. These tests read the NEWEST migration that defines
 * public.enforce_catering_stage_transition() (first
 * 20261013010000_catering_stage_transition_guard.sql, relabelled in
 * 20261025000000_catering_atomic_setup_and_guards.sql) and fail when its lists
 * or labels drift from logic.ts, so a stage added, reordered or renamed in one
 * place but not the other is caught before it reaches the database. A later
 * migration that replaces the function is picked up without editing this file.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

/**
 * SQL with `--` comments removed, so a header comment cannot satisfy a check,
 * and Windows line endings normalized (a checkout may convert them).
 */
function stripComments(sql: string): string {
  return sql.replace(/\r\n/g, "\n").replace(/--.*$/gm, "");
}

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: stripComments(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8")) }));

/** The newest migration (by timestamped file name) whose SQL matches `pattern`. */
function newestMigrationMatching(pattern: RegExp): { name: string; sql: string } {
  const found = [...MIGRATIONS].reverse().find((migration) => pattern.test(migration.sql));
  if (!found) throw new Error(`no migration matches ${pattern}`);
  return found;
}

const FUNCTION_START = /create\s+or\s+replace\s+function\s+public\.enforce_catering_stage_transition\s*\(/i;

/** The function's own statement, from `create or replace function` to its closing `$$;`. */
const FUNCTION_SQL = (() => {
  const { name, sql } = newestMigrationMatching(FUNCTION_START);
  const start = sql.search(FUNCTION_START);
  const bodyOpen = sql.indexOf("$$", start);
  const end = sql.indexOf("$$;", bodyOpen + 2);
  if (bodyOpen === -1 || end === -1) throw new Error(`could not find the function body in ${name}`);
  return sql.slice(start, end + 3);
})();

const ALL_SQL = MIGRATIONS.map((migration) => migration.sql).join("\n");

/** The quoted values of `<name> constant text[] := array[...]` in the trigger body. */
function sqlTextArray(name: string): string[] {
  const match = FUNCTION_SQL.match(new RegExp(`${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`, "i"));
  if (!match) throw new Error(`${name} not found in the stage guard function`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1]);
}

function sqlTextConstant(name: string): string {
  const match = FUNCTION_SQL.match(new RegExp(`${name}\\s+constant\\s+text\\s*:=\\s*'([^']*)'`, "i"));
  if (!match) throw new Error(`${name} not found in the stage guard function`);
  return match[1];
}

/** The `<name> constant jsonb := '{...}'` map in the trigger body, parsed. */
function sqlJsonConstant(name: string): unknown {
  const match = FUNCTION_SQL.match(new RegExp(`${name}\\s+constant\\s+jsonb\\s*:=\\s*'([^']*)'`, "i"));
  if (!match) throw new Error(`${name} not found in the stage guard function`);
  return JSON.parse(match[1]);
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

  it("names stages with the same labels as ORDER_STAGE_LABELS", () => {
    expect(sqlJsonConstant("stage_labels")).toEqual(ORDER_STAGE_LABELS);
  });

  it("puts labels, not raw stage keys, in both error messages", () => {
    expect(FUNCTION_SQL).toMatch(
      /cannot move from % to %\.',\s*coalesce\(stage_labels ->> old\.stage, old\.stage\),\s*coalesce\(stage_labels ->> new\.stage, new\.stage\)/,
    );
    const insertError = FUNCTION_SQL.match(
      /must start in %, not %\.',\s*stage_labels ->> '([^']+)',\s*coalesce\(stage_labels ->> new\.stage, new\.stage\)/,
    );
    expect(insertError?.[1]).toBe(ORDER_STAGES[0]);
  });

  it("starts user-created orders in the first pipeline stage", () => {
    expect(FUNCTION_SQL).toMatch(/if new\.stage = '([^']+)' then/);
    expect(FUNCTION_SQL.match(/if new\.stage = '([^']+)' then/)?.[1]).toBe(ORDER_STAGES[0]);
  });

  it("guards inserts and stage updates, and keeps the function off the Data API", () => {
    const trigger = newestMigrationMatching(/create\s+trigger\s+catering_orders_stage_transition\b/i);
    expect(trigger.sql).toMatch(/before insert or update of stage on public\.catering_orders/i);
    // Comments are already stripped: the header comments also say "SECURITY
    // INVOKER", so matching raw text would pass even for a definer function.
    expect(FUNCTION_SQL).toMatch(/security invoker/i);
    expect(FUNCTION_SQL).not.toMatch(/security definer/i);
    expect(FUNCTION_SQL).toMatch(/set search_path = public/i);
    expect(ALL_SQL).toMatch(
      /revoke all on function public\.enforce_catering_stage_transition\(\) from public, anon, authenticated;/i,
    );
    expect(ALL_SQL).not.toMatch(/grant execute on function public\.enforce_catering_stage_transition/i);
  });

  it("needs both catering.override and catering.manage for a move back or a restore", () => {
    expect(FUNCTION_SQL).toMatch(
      /has_permission\('catering\.override'\) and public\.has_permission\('catering\.manage'\)/,
    );
  });
});
