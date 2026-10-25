import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The vitest harness has no live Postgres, so this locks in the shape of the
 * migration that makes "one Discord ID per person" a database rule: a UNIQUE
 * index, partial on non-null values (most rows have no ID yet), on the column
 * the self-service link and the People profile edit both write.
 */
const sql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20261025020000_profiles_private_discord_id_unique.sql",
  ),
  "utf8",
);

const executable = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join(" ")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

describe("profiles_private_discord_id_unique migration", () => {
  it("creates a partial unique index on discord_user_id, idempotently", () => {
    expect(executable).toBe(
      "create unique index if not exists profiles_private_discord_user_id_uq on public.profiles_private (discord_user_id) where discord_user_id is not null;",
    );
  });

  it("only adds an index: nothing is dropped or altered", () => {
    expect(executable).not.toMatch(/\b(drop|alter|delete|update|truncate)\b/);
  });
});
