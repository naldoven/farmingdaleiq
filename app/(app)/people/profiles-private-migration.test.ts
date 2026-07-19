import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PPL2b (HIGH, privacy — DB layer): the raw-PostgREST hole is that
 * `profiles_select_store_member` lets any store member SELECT every column of
 * every profiles row, including phone/email/birthdate/hired_on/discord_user_id.
 *
 * The vitest harness has no live Postgres (no pglite), so true RLS behavior is
 * verified against Supabase when the migration is applied. These assertions
 * lock in the migration's structure so the fix can't silently regress: the PII
 * columns are physically moved off the store-member-readable `profiles` table
 * into `profiles_private`, whose RLS only admits the person themselves or a
 * people.manage holder. With the columns gone from `profiles`, the raw-REST
 * read of another member's PII is closed by construction.
 */
const migrationSql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260718020000_profiles_private_pii.sql",
  ),
  "utf8",
);

const normalized = migrationSql.toLowerCase().replace(/\s+/g, " ");

describe("PPL2b migration: profiles_private", () => {
  it("creates the private table keyed 1:1 to profiles with cascade delete", () => {
    expect(normalized).toContain("create table if not exists public.profiles_private");
    expect(normalized).toContain(
      "profile_id uuid primary key references public.profiles(id) on delete cascade",
    );
  });

  it("moves every sensitive column onto the private table", () => {
    for (const column of ["phone", "email", "birthdate", "hired_on", "discord_user_id"]) {
      expect(normalized).toContain(column);
    }
  });

  it("restricts SELECT on the private table to self or a people.manage holder", () => {
    expect(normalized).toContain(
      "using (profile_id = auth.uid() or public.has_permission('people.manage'))",
    );
    expect(normalized).toContain("enable row level security");
    // anon gets nothing.
    expect(normalized).toContain("revoke all on public.profiles_private from anon");
  });

  it("drops the sensitive columns from the store-member-readable profiles table", () => {
    expect(normalized).toContain("drop column if exists phone");
    expect(normalized).toContain("drop column if exists email");
    expect(normalized).toContain("drop column if exists birthdate");
    expect(normalized).toContain("drop column if exists hired_on");
    expect(normalized).toContain("drop column if exists discord_user_id");
  });

  it("backfills existing data before dropping the columns", () => {
    const insertIdx = normalized.indexOf("insert into public.profiles_private (profile_id, phone");
    const dropIdx = normalized.indexOf("drop column if exists phone");
    expect(insertIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeLessThan(dropIdx);
  });

  it("relocates the discord/email write guard onto the private table", () => {
    expect(normalized).toContain("create trigger profile_private_guard");
    expect(normalized).toContain(
      "cannot change email/discord_user_id/hired_on",
    );
  });

  it("writes the invited/new-user email into profiles_private, not profiles", () => {
    expect(normalized).toContain("insert into public.profiles_private (profile_id, email)");
  });
});
