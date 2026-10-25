import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The database backstop for "nobody edits catering prices in the app". The
 * server action refuses a price change, but only this trigger stops a direct
 * PostgREST update by a catering.manage holder. The file is checked as text
 * because the repo has no database in CI; the orchestrator smoke-tests the
 * applied migration separately.
 */
const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261025050000_catering_menu_price_lock.sql"),
  "utf8",
);
const SQL_ONLY = MIGRATION.replace(/--.*$/gm, "");

describe("catering menu price lock migration", () => {
  it("guards only the two price columns on update", () => {
    expect(SQL_ONLY).toMatch(
      /before update of pickup_price_cents, delivery_price_cents on public\.catering_menu_items/i,
    );
    expect(SQL_ONLY).not.toMatch(/before insert/i);
  });

  it("lets the service role and migrations through", () => {
    expect(SQL_ONLY).toMatch(/auth\.uid\(\) is null or auth\.role\(\) = 'service_role'/);
  });

  it("refuses a changed price with the same message the app shows", () => {
    expect(SQL_ONLY).toMatch(/new\.pickup_price_cents is distinct from old\.pickup_price_cents/);
    expect(SQL_ONLY).toMatch(/new\.delivery_price_cents is distinct from old\.delivery_price_cents/);
    expect(SQL_ONLY).toContain("Prices come from the catering catalog and cannot be changed here.");
  });

  it("is an invoker function kept off the Data API", () => {
    expect(SQL_ONLY).toMatch(/security invoker/i);
    expect(SQL_ONLY).not.toMatch(/security definer/i);
    expect(SQL_ONLY).toMatch(
      /revoke all on function public\.enforce_catering_menu_price_lock\(\) from public, anon, authenticated;/i,
    );
  });
});
