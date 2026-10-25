import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { setupPlanInputs } from "@/app/(app)/catering/logic";
import { splitStatements } from "@/lib/supabase/security-definer-access";

/**
 * The vitest harness has no Postgres, so these tests read the migrations as
 * text (like stage-guard-migration.test.ts) and pin the parts of
 * 20261025000000_catering_atomic_setup_and_guards.sql that the app relies on:
 *
 *   - public.catering_replace_setup, the one-transaction packing-list build
 *     both the manual build (actions.ts) and the cron call: SECURITY INVOKER
 *     so a leader's call stays under RLS, revoked from logged-out clients,
 *     callable by authenticated and service_role, and writing in the order
 *     that makes the stamp safe to trust (lock, delete, insert, stamp last).
 *   - catering_orders keeps user INSERT and UPDATE policies and has no user
 *     DELETE policy, replayed across every migration so a later policy
 *     change is checked too.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

/** SQL with `--` comments removed and Windows line endings normalized. */
function stripComments(sql: string): string {
  return sql.replace(/\r\n/g, "\n").replace(/--.*$/gm, "");
}

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }));

const ALL_SQL = MIGRATION_FILES.map((file) => stripComments(file.sql)).join("\n");

const FUNCTION_START = /create\s+or\s+replace\s+function\s+public\.catering_replace_setup\s*\(/i;

/** The newest definition of the function, from `create or replace` to its closing `$$;`. */
const FUNCTION_SQL = (() => {
  const file = [...MIGRATION_FILES].reverse().find((f) => FUNCTION_START.test(stripComments(f.sql)));
  if (!file) throw new Error("no migration defines public.catering_replace_setup");
  const sql = stripComments(file.sql);
  const start = sql.search(FUNCTION_START);
  const bodyOpen = sql.indexOf("$$", start);
  const end = sql.indexOf("$$;", bodyOpen + 2);
  if (bodyOpen === -1 || end === -1) throw new Error(`could not find the function body in ${file.name}`);
  return sql.slice(start, end + 3);
})();

const SIGNATURE = String.raw`public\.catering_replace_setup\(uuid, boolean, text\[\], jsonb, jsonb, jsonb\)`;

/** The argument names, in order, as the app's `.rpc("catering_replace_setup", ...)` payload uses them. */
const RPC_ARG_NAMES = ["p_order_id", "p_force", "p_stages", "p_planned_from", "p_rows", "p_preorder_rows"];

describe("catering_replace_setup migration", () => {
  it("takes the arguments the app sends, in the order the grants name their types", () => {
    const params = FUNCTION_SQL.match(/catering_replace_setup\s*\(([\s\S]*?)\)\s*returns/i)?.[1] ?? "";
    expect([...params.matchAll(/(p_\w+)\s+\w+/g)].map((match) => match[1])).toEqual(RPC_ARG_NAMES);
    expect(params).toMatch(/p_order_id uuid,\s*p_force boolean,\s*p_stages text\[\],\s*p_planned_from jsonb,\s*p_rows jsonb,\s*p_preorder_rows jsonb/);
  });

  it("runs as the caller, so a leader's build still goes through RLS", () => {
    expect(FUNCTION_SQL).toMatch(/security invoker/i);
    expect(FUNCTION_SQL).not.toMatch(/security definer/i);
    expect(FUNCTION_SQL).toMatch(/set search_path = public/i);
  });

  it("is closed to logged-out clients and open to signed-in users and the cron", () => {
    expect(ALL_SQL).toMatch(new RegExp(`revoke all on function ${SIGNATURE}\\s+from public, anon, authenticated;`, "i"));
    expect(ALL_SQL).toMatch(
      new RegExp(`grant execute on function ${SIGNATURE}\\s+to authenticated, service_role;`, "i"),
    );
    expect(ALL_SQL).not.toMatch(new RegExp(`grant [^;]* on function ${SIGNATURE}\\s+to [^;]*\\b(public|anon)\\b`, "i"));
  });

  it("locks the order row, then skips without writing when it should not build", () => {
    expect(FUNCTION_SQL).toMatch(/from public\.catering_orders\s+where id = p_order_id\s+for update;/);
    expect(FUNCTION_SQL).toMatch(/v_order\.stage = any\(p_stages\)/);
    // The cron's idempotency: unforced, an already-built list is left alone.
    expect(FUNCTION_SQL).toMatch(
      /if not coalesce\(p_force, false\) and v_order\.setup_generated_at is not null then\s+return query select false, 'already_built'/,
    );
    expect(FUNCTION_SQL).toMatch(/if v_current is distinct from v_expected then\s+return query select false, 'order_changed'/);
  });

  it("compares exactly the fields setupPlanInputs sends", () => {
    const current = FUNCTION_SQL.match(/v_current := jsonb_build_object\(([\s\S]*?)\n {2}\);/);
    expect(current).not.toBeNull();
    const sqlKeys = [...current![1].matchAll(/^\s*'(\w+)',/gm)].map((match) => match[1]).sort();
    const sample = setupPlanInputs(
      { headcount: 1, paper_goods: false, fulfillment: null, notes: null, selected_condiments: [] },
      [{ menu_item_id: "menu-1", qty: 1 }],
    );
    expect(sqlKeys).toEqual(Object.keys(sample).sort());
    const itemKeys = current![1].match(/jsonb_build_object\('(\w+)', i\.menu_item_id, '(\w+)', i\.qty\)/);
    expect([itemKeys?.[1], itemKeys?.[2]].sort()).toEqual(Object.keys(sample.items[0]).sort());
  });

  it("replaces only generated rows, adds only missing Pre-order rows, and stamps last", () => {
    const deleteAt = FUNCTION_SQL.search(
      /delete from public\.catering_checklist_items\s+where order_id = p_order_id\s+and setup_section is not null;/,
    );
    const setupInsertAt = FUNCTION_SQL.search(
      /insert into public\.catering_checklist_items \(order_id, stage, label, setup_section, sort\)\s+select p_order_id, 'setup'/,
    );
    const preOrderInsertAt = FUNCTION_SQL.search(
      /insert into public\.catering_checklist_items \(order_id, stage, label, sort\)\s+select p_order_id, 'out'/,
    );
    const stampAt = FUNCTION_SQL.search(/set setup_generated_at = now\(\)/);

    expect(deleteAt).toBeGreaterThan(FUNCTION_SQL.search(/for update;/));
    expect(setupInsertAt).toBeGreaterThan(deleteAt);
    expect(preOrderInsertAt).toBeGreaterThan(setupInsertAt);
    expect(stampAt).toBeGreaterThan(preOrderInsertAt);
    // The only stamp write is the last one.
    expect(FUNCTION_SQL.match(/setup_generated_at =/g)).toHaveLength(1);
    // Same rule as the old planMissingPreOrderChecklist: trimmed, case insensitive.
    expect(FUNCTION_SQL).toMatch(/and ci\.stage = 'out'\s+and lower\(btrim\(ci\.label\)\) = lower\(btrim\(p\.label\)\)/);
    // A generated row without a section could never be replaced, so it is refused.
    expect(FUNCTION_SQL).toMatch(/nullif\(btrim\(r\.row_value ->> 'setup_section'\), ''\) is null/);
  });
});

describe("catering_orders policies after every migration", () => {
  /** Policy name to command (all, select, insert, update, delete), replayed in file order. */
  const policies = new Map<string, { command: string; sql: string }>();
  for (const file of MIGRATION_FILES) {
    for (const statement of splitStatements(file.sql)) {
      const text = statement.text.replace(/\s+/g, " ").trim().toLowerCase();
      const created = text.match(
        /^create policy "?(\w+)"? on (?:public\.)?catering_orders\b(?: as \w+)?(?: for (\w+))?/,
      );
      if (created) {
        policies.set(created[1], { command: created[2] ?? "all", sql: text });
        continue;
      }
      const dropped = text.match(/^drop policy (?:if exists )?"?(\w+)"? on (?:public\.)?catering_orders\b/);
      if (dropped) policies.delete(dropped[1]);
    }
  }

  it("lets catering.manage insert and update orders", () => {
    for (const command of ["insert", "update"]) {
      const policy = [...policies.values()].find((p) => p.command === command);
      expect(policy?.sql).toContain("has_permission('catering.manage')");
    }
  });

  it("gives users no way to delete an order", () => {
    // A FOR ALL policy would include DELETE, which is how a leader could
    // reopen a cancelled order by delete and re-insert.
    expect([...policies.values()].map((p) => p.command).sort()).toEqual(["insert", "select", "update"]);
  });
});
