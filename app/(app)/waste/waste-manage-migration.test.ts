import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner decision 2026-10-25: waste costs and item setup are for managers only,
 * so Shift Supervisors lose waste.manage while waste.log (counting waste) stays
 * with everyone. The vitest harness has no live Postgres, so these assertions
 * lock in the migration's text: it deletes exactly one key from exactly one
 * role, and the seed it builds on still has the premise it relies on.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");
const SEED_FILE = "20260707001900_seed_store_config.sql";
const MIGRATION_FILE = "20261025040000_waste_manage_managers_only.sql";

/** SQL with `--` comments removed (a header comment must not satisfy a check) and line endings normalized. */
function stripComments(sql: string): string {
  return sql.replace(/\r\n/g, "\n").replace(/--.*$/gm, "");
}

function readMigration(name: string): string {
  return stripComments(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));
}

const migrationSql = readMigration(MIGRATION_FILE);
const normalized = migrationSql.toLowerCase().replace(/\s+/g, " ").trim();
const seedSql = readMigration(SEED_FILE);

describe("waste.manage managers-only migration", () => {
  it("is one delete statement against role_permissions and nothing else", () => {
    const statements = migrationSql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(normalized).toMatch(/^delete from public\.role_permissions rp using public\.roles r where /);
    for (const verb of ["insert", "update", "truncate", "drop", "alter", "grant"]) {
      expect(normalized).not.toMatch(new RegExp(`\\b${verb}\\b`));
    }
  });

  it("targets exactly the Shift Supervisor role by its seeded name and exactly waste.manage", () => {
    expect([...migrationSql.matchAll(/'([^']*)'/g)].map((match) => match[1])).toEqual([
      "Shift Supervisor",
      "waste.manage",
    ]);
    expect(normalized).toContain("rp.role_id = r.id");
    expect(normalized).toContain("r.name = 'shift supervisor'");
    expect(normalized).toContain("rp.permission_key = 'waste.manage'");
  });

  it("leaves waste.log alone", () => {
    expect(normalized).not.toContain("waste.log");
  });

  it("sorts after the seed that grants the key, so the delete runs last", () => {
    expect(MIGRATION_FILE > SEED_FILE).toBe(true);
  });
});

describe("the seed premise the migration depends on", () => {
  it("seeds a role named exactly Shift Supervisor", () => {
    expect(seedSql).toMatch(/\('Shift Supervisor',\s*true,\s*\d+\)/);
  });

  it("grants waste.manage to Shift Supervisor through supervisor_keys", () => {
    expect(seedSql).toMatch(/supervisor_keys as \([^)]*waste\.manage/);
    expect(seedSql).toMatch(/select permission_key from supervisor_keys where r\.name = 'Shift Supervisor'/);
  });

  it("keeps waste.log in the base keys every role inherits", () => {
    expect(seedSql).toMatch(/base_keys as \([^)]*'waste\.log'/);
  });
});
