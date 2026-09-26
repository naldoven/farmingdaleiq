import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = __dirname;
const migrationName = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_revoke_public_security_definer_access.sql"),
);

if (!migrationName) {
  throw new Error("Missing security-definer access migration");
}

const sql = readFileSync(join(migrationsDir, migrationName), "utf8");

const authenticatedRpcSignatures = [
  "adjust_tokens(uuid, integer, text)",
  "cancel_reward_claim(uuid)",
  "current_store_id()",
  "delete_position(uuid)",
  "delete_position_group(uuid)",
  "gift_tokens(uuid, integer, text, uuid)",
  "graduate_trainee(uuid)",
  "has_permission(text)",
  "redeem_reward(uuid, uuid)",
  "setup_has_top_performer(uuid)",
];

const triggerOnlySignatures = [
  "create_position_passport()",
  "enforce_profile_private_guard()",
  "enforce_profile_privilege_guard()",
  "handle_new_auth_user()",
];

describe("security-definer access migration", () => {
  it("removes broad defaults for future public functions", () => {
    expect(sql).toContain(
      "revoke execute on functions from anon, authenticated;",
    );
  });

  it("allows only signed-in callers to use client RPCs", () => {
    for (const signature of authenticatedRpcSignatures) {
      expect(sql).toContain(
        `revoke all on function public.${signature} from public, anon, authenticated;`,
      );
      expect(sql).toContain(
        `grant execute on function public.${signature} to authenticated;`,
      );
    }
  });

  it("keeps trigger helpers off the Data API", () => {
    for (const signature of triggerOnlySignatures) {
      expect(sql).toContain(
        `revoke all on function public.${signature} from public, anon, authenticated;`,
      );
      expect(sql).not.toContain(
        `grant execute on function public.${signature} to authenticated;`,
      );
    }
  });

  it("makes the privileged infraction view authenticated-only", () => {
    expect(sql).toContain(
      "revoke all on table public.my_infractions from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant select on table public.my_infractions to authenticated;",
    );
  });
});
