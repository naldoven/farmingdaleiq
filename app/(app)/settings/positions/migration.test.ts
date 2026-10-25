import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the SQL of 20261025030000_positions_settings_manage.sql. SQL cannot be
 * unit-run here, so these read the file. Header comments are stripped first so
 * a comment cannot satisfy a check, and Windows line endings are normalized.
 *
 * The delete functions are compared against the ORIGINAL definitions in
 * 20260718010300_delete_position_rpc.sql: the only allowed difference is the
 * permission key, because the brief for this change was "keep everything else
 * identical".
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function read(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n");
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

function normalize(sql: string): string {
  return stripComments(sql).replace(/\s+/g, " ").trim();
}

function functionBodies(sql: string): string[] {
  return normalize(sql).match(/create or replace function .*? \$\$;/g) ?? [];
}

const raw = read("20261025030000_positions_settings_manage.sql");
const sql = normalize(raw);

describe("positions_settings_manage migration", () => {
  it("opens with the apply-after-the-owner's-go warning", () => {
    expect(raw.split("\n")[0]).toBe(
      "-- Changes RLS on populated tables; apply only after the owner's go, before merging #83.",
    );
  });

  it.each([
    ["position_groups_write_manager", "position_groups"],
    ["positions_write_manager", "positions"],
  ])("recreates %s to require settings.manage, dropping the old policy first", (policy, table) => {
    const drop = `drop policy if exists ${policy} on public.${table};`;
    const create =
      `create policy ${policy} on public.${table} for all ` +
      `using (public.has_permission('settings.manage')) ` +
      `with check (public.has_permission('settings.manage'));`;
    expect(sql).toContain(drop);
    expect(sql).toContain(create);
    expect(sql.indexOf(drop)).toBeLessThan(sql.indexOf(create));
  });

  it("no longer mentions setups.manage in any statement", () => {
    expect(sql).not.toContain("setups.manage");
  });

  it("leaves the select policies alone", () => {
    expect(sql).not.toContain("create policy positions_select_authenticated");
    expect(sql).not.toContain("create policy position_groups_select_authenticated");
  });

  it("changes only the permission key in the two delete functions", () => {
    const original = functionBodies(read("20260718010300_delete_position_rpc.sql")).map((body) =>
      body.replaceAll("setups.manage", "settings.manage"),
    );
    const recreated = functionBodies(raw);
    expect(original).toHaveLength(2);
    expect(recreated).toEqual(original);
  });

  it("keeps both delete functions closed to logged-out users and open to signed-in users", () => {
    for (const fn of ["delete_position(uuid)", "delete_position_group(uuid)"]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated;`);
    }
  });
});
