import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeSecurityObjects,
  findMissingAuthenticatedGrants,
  findProtectionGaps,
  splitStatements,
  type MigrationFile,
} from "./security-definer-access";

/**
 * Regression guard for privileged database objects. The vitest harness has no
 * live Postgres, so this replays every migration statically (see
 * security-definer-access.ts) and checks the end state: every SECURITY DEFINER
 * function and view must be unreachable by logged-out clients, and the RPCs the
 * app calls must stay callable by signed-in users.
 *
 * It is drift-proof on purpose. Functions are discovered from the migrations
 * themselves, so a definer function added next month with no revoke fails here
 * without anyone editing this file.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * SECURITY DEFINER functions that are deliberately left callable by `anon`.
 * Keep this list short; every entry needs a reason a reviewer can check.
 */
const ANON_CALLABLE_ALLOWLIST: Record<string, string> = {
  // The waste select policies carry no `to authenticated` clause, so they are
  // also evaluated for anon. Without the anon grant, a raw logged-out
  // PostgREST read would raise 42501 instead of returning no rows. The
  // function returns false when logged out (auth.uid() is null), so the grant
  // exposes no data. See 20260801000000_waste_hardening.sql.
  "public.is_active_profile":
    "RLS helper that returns false for anon; grants no data access",
};

/**
 * Functions the app depends on as the signed-in user but never reaches through
 * `.rpc("...")`, so the source scan below cannot find them.
 */
const AUTHENTICATED_RLS_HELPERS: Record<string, string> = {
  // Called inside RLS policies (for example on profiles) while evaluating a
  // signed-in user's query, so authenticated must keep EXECUTE.
  current_store_id: "store-scoping helper used by RLS policies",
};

/**
 * RPCs the app calls only through the service-role client from a cron job.
 * They are deliberately NOT granted to authenticated, so a signed-in user
 * cannot run them from the browser.
 */
const SERVICE_ROLE_ONLY_RPCS: Record<string, string> = {
  // Marks every open clean on a past day missed and carries it over; only the
  // hourly job in app/api/cron/cleaning may decide a day is over.
  close_cleaning_days: "cleaning day-end close, granted to service_role only",
};

function readMigrations(): MigrationFile[] {
  const dir = path.join(REPO_ROOT, "supabase", "migrations");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), "utf8") }));
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** Every function name passed to `.rpc("name", ...)` in app code. */
function discoverRpcNames(): string[] {
  const names = new Set<string>();
  for (const root of ["app", "lib", "components"]) {
    for (const file of sourceFiles(path.join(REPO_ROOT, root))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\.rpc\(\s*["'`]([A-Za-z0-9_]+)["'`]/g)) {
        names.add(match[1]);
      }
    }
  }
  return [...names].sort();
}

describe("privileged objects in the real migrations", () => {
  const objects = analyzeSecurityObjects(readMigrations());
  const definerFunctions = objects.filter((o) => o.kind === "function" && o.definer);

  it("finds the known privileged surface (guards against the scanner going blind)", () => {
    const names = definerFunctions.map((o) => o.name);
    expect(names).toContain("public.has_permission");
    expect(names).toContain("public.is_active_profile");
    expect(
      objects.some((o) => o.kind === "view" && o.name === "public.my_infractions" && o.definer),
    ).toBe(true);
  });

  it("leaves no SECURITY DEFINER function or view reachable by logged-out clients", () => {
    expect(findProtectionGaps(objects, Object.keys(ANON_CALLABLE_ALLOWLIST))).toEqual([]);
  });

  it("keeps grant execute to authenticated on every RPC the app calls", () => {
    const rpcNames = discoverRpcNames().filter((name) => !(name in SERVICE_ROLE_ONLY_RPCS));
    // A refactor that hides the names from this scan must fail loudly rather
    // than leave the check passing on an empty list.
    expect(rpcNames.length).toBeGreaterThan(0);
    const names = [...new Set([...rpcNames, ...Object.keys(AUTHENTICATED_RLS_HELPERS)])];
    expect(findMissingAuthenticatedGrants(objects, names)).toEqual([]);
  });

  it("keeps trigger helpers off the Data API", () => {
    const exposed = definerFunctions
      .filter((o) => o.returnsTrigger && o.grantedToAuthenticated)
      .map((o) => `${o.name} (${o.definedAt.file}:${o.definedAt.line})`);
    expect(exposed).toEqual([]);
  });

  it("keeps my_infractions selectable by signed-in users and closed to anon", () => {
    const view = objects.find((o) => o.kind === "view" && o.name === "public.my_infractions");
    expect(view?.definer).toBe(true);
    expect(view?.revokedFromAnon).toBe(true);
    expect(view?.grantedToAuthenticated).toBe(true);
  });
});

describe("security-definer scanner (in-memory migrations)", () => {
  const file = (name: string, sql: string): MigrationFile => ({ name, sql });

  const revoked = `
revoke all on function public.do_thing(uuid, int) from public, anon, authenticated;
grant execute on function public.do_thing(uuid, int) to authenticated;
`;

  it("accepts a multi-line, schema-qualified, dollar-quoted definer function with its revoke", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `
-- security definer is only a comment here; so is this create function x();
CREATE OR REPLACE FUNCTION public.Do_Thing (
  p_id uuid,
  p_amount integer DEFAULT coalesce(0, 1)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  perform 1; -- a semicolon inside the body must not split the statement
END;
$fn$;
${revoked}`,
      ),
    ]);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({
      kind: "function",
      name: "public.do_thing",
      arity: 2,
      definer: true,
      revokedFromPublic: true,
      revokedFromAnon: true,
      grantedToAuthenticated: true,
    });
    expect(findProtectionGaps(objects)).toEqual([]);
  });

  it("reports a definer function that has no revoke, with file and line", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `-- header
create function public.sneaky()
returns void language sql security definer
as $$ select 1 $$;
`,
      ),
    ]);
    expect(findProtectionGaps(objects)).toEqual([
      "public.sneaky(0 args) is SECURITY DEFINER (latest definition at " +
        "20260101000000_a.sql:2) but no revoke from public and anon follows its creation",
    ]);
  });

  it("reports a function revoked from public but still callable by anon", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.half() returns void language sql security definer as $$ select 1 $$;
revoke all on function public.half() from public;
grant execute on function public.half() to authenticated;`,
      ),
    ]);
    const gaps = findProtectionGaps(objects);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("no revoke from anon follows");
  });

  it("accepts revoke execute, and revokes spread over statements and later migrations", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.f(a uuid) returns void language sql security definer as $$ select 1 $$;
revoke execute on function public.f(uuid) from public;`,
      ),
      file("20260102000000_b.sql", `revoke execute on function f(uuid) from "anon";`),
    ]);
    expect(findProtectionGaps(objects)).toEqual([]);
  });

  it("sorts migrations by filename, whatever order they are passed in", () => {
    const objects = analyzeSecurityObjects([
      file("20260102000000_revoke.sql", `revoke all on function public.f() from public, anon;`),
      file(
        "20260101000000_create.sql",
        `create function public.f() returns void language sql security definer as $$ select 1 $$;`,
      ),
    ]);
    expect(findProtectionGaps(objects)).toEqual([]);
  });

  it("does not treat a revoke that comes before the creation as protection", () => {
    const objects = analyzeSecurityObjects([
      file("20260101000000_a.sql", `revoke all on function public.f() from public, anon;`),
      file(
        "20260102000000_b.sql",
        `create function public.f() returns void language sql security definer as $$ select 1 $$;`,
      ),
    ]);
    expect(findProtectionGaps(objects)).toHaveLength(1);
  });

  it("keeps the earlier revoke when a later migration only replaces the function", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.f() returns int language sql security definer as $$ select 1 $$;
revoke all on function public.f() from public, anon;`,
      ),
      file(
        "20260102000000_b.sql",
        `create or replace function public.f() returns int language sql security definer as $$ select 2 $$;`,
      ),
    ]);
    expect(findProtectionGaps(objects)).toEqual([]);
    expect(objects[0].definedAt.file).toBe("20260102000000_b.sql");
  });

  it("requires a fresh revoke when a function is dropped and recreated", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.f() returns int language sql security definer as $$ select 1 $$;
revoke all on function public.f() from public, anon;`,
      ),
      file(
        "20260102000000_b.sql",
        `drop function if exists public.f();
create function public.f() returns int language sql security definer as $$ select 2 $$;`,
      ),
    ]);
    expect(findProtectionGaps(objects)).toHaveLength(1);
  });

  it("forgets dropped functions and tells overloads apart by argument count", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.f(a uuid) returns int language sql security definer as $$ select 1 $$;
create function public.f(a uuid, b text) returns int language sql security definer as $$ select 1 $$;
create function public.gone() returns int language sql security definer as $$ select 1 $$;
revoke all on function public.f(uuid) from public, anon;
drop function public.gone();`,
      ),
    ]);
    const gaps = findProtectionGaps(objects);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("public.f(2 args)");
  });

  it("reports a later grant to public that reopens a revoked function", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.f() returns int language sql security definer as $$ select 1 $$;
revoke all on function public.f() from public, anon;`,
      ),
      file("20260102000000_b.sql", `grant execute on function public.f() to public;`),
    ]);
    expect(findProtectionGaps(objects)).toHaveLength(1);
  });

  it("picks up a function flipped to SECURITY DEFINER with alter function", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.f() returns int language sql as $$ select 1 $$;
alter function public.f() security definer;`,
      ),
    ]);
    expect(findProtectionGaps(objects)).toHaveLength(1);
  });

  it("ignores invoker functions and 'security definer' in comments, strings and bodies", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `/* create function public.in_comment() returns int language sql security definer as $$ select 1 $$; */
create function public.invoker() returns int language sql security invoker as $$ select 1 $$;
create function public.plain() returns text language sql as $x$ select 'security definer; create function' $x$;
create function public.str(a text default 'security definer') returns int language sql as 'select 1';`,
      ),
    ]);
    expect(objects.filter((o) => o.definer)).toEqual([]);
    expect(findProtectionGaps(objects)).toEqual([]);
  });

  it("allowlists named functions for the anon check only, and flags stale entries", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.helper() returns boolean language sql security definer as $$ select false $$;
revoke all on function public.helper() from public;
grant execute on function public.helper() to anon, authenticated;
create function public.other() returns boolean language sql security definer as $$ select false $$;
revoke all on function public.other() from public;`,
      ),
    ]);
    const gaps = findProtectionGaps(objects, ["public.helper"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("public.other(0 args)");

    const stale = findProtectionGaps(objects, ["public.helper", "public.other", "public.nope"]);
    expect(stale.filter((p) => p.startsWith("allowlist entry"))).toEqual([
      expect.stringContaining("public.nope"),
    ]);
  });

  it("checks definer views and skips security_invoker views", () => {
    const sql = (revoke: string) => `
create view public.leaky with (security_invoker = false) as select 1 as a;
create view public.safe with (security_invoker = true) as select 1 as a;
create or replace view public.bare with (security_invoker) as select 1 as a;
${revoke}`;
    const open = analyzeSecurityObjects([file("20260101000000_a.sql", sql(""))]);
    expect(findProtectionGaps(open)).toEqual([
      "view public.leaky is SECURITY DEFINER (latest definition at " +
        "20260101000000_a.sql:2) but no revoke from anon follows its creation",
    ]);

    const closed = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        sql(`revoke all on table public.leaky from public, anon, authenticated;
grant select on table public.leaky to authenticated;`),
      ),
    ]);
    expect(findProtectionGaps(closed)).toEqual([]);
    expect(closed.find((o) => o.name === "public.leaky")?.grantedToAuthenticated).toBe(true);
  });

  it("reports RPCs with no standing grant to authenticated, and RPCs nobody defines", () => {
    const objects = analyzeSecurityObjects([
      file(
        "20260101000000_a.sql",
        `create function public.ok() returns int language sql security definer as $$ select 1 $$;
create function public.locked() returns int language sql security definer as $$ select 1 $$;
revoke all on function public.ok() from public, anon, authenticated;
grant execute on function public.ok() to authenticated;
revoke all on function public.locked() from public, anon, authenticated;`,
      ),
    ]);
    expect(findMissingAuthenticatedGrants(objects, ["ok"])).toEqual([]);
    expect(findMissingAuthenticatedGrants(objects, ["locked", "missing"])).toEqual([
      "public.locked(0 args) (20260101000000_a.sql:2) has no grant execute to authenticated",
      "public.missing is expected but no migration defines it",
    ]);
  });

  it("splits statements around comments, quotes and dollar-quoted bodies", () => {
    const statements = splitStatements(
      `-- one; two
select 'a;b', "c;d"; /* x; /* nested; */ y; */
do $$ begin perform 1; end $$; select 3`,
    );
    expect(statements.map((s) => s.text)).toEqual([
      `select 'a;b', "c;d"`,
      "do $$ $$",
      "select 3",
    ]);
    expect(statements.map((s) => s.line)).toEqual([2, 3, 3]);
  });
});
