import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the RLS text of 20261025010000_store_setup_areas.sql. SQL cannot be
 * unit-run here, so these read the file: header comments are stripped first
 * so a comment cannot satisfy a check, and Windows line endings are
 * normalized (a checkout may convert them).
 */
const MIGRATION = path.resolve(
  __dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "20261025010000_store_setup_areas.sql",
);

const sql = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ");

describe("store_setup_areas migration", () => {
  it("turns on row level security", () => {
    expect(sql).toContain("alter table public.store_setup_areas enable row level security");
  });

  it("lets any signed-in member read", () => {
    expect(sql).toMatch(/create policy store_setup_areas_select_authenticated .* for select using \(auth\.uid\(\) is not null\)/);
  });

  it("limits writes to settings.manage and ties confirmed_by to the signed-in user", () => {
    const policy = sql.match(/create policy store_setup_areas_write_manager .*?;/)?.[0] ?? "";
    expect(policy).toContain("for all");
    expect(policy).toContain("using (public.has_permission('settings.manage'))");
    expect(policy).toContain(
      "with check (public.has_permission('settings.manage') and confirmed_by = auth.uid())",
    );
  });
});
