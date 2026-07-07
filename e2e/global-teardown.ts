import fs from "node:fs";

import { ADMIN_INFO_PATH, STORAGE_STATE_PATH, type AdminFixtureInfo } from "./global-setup";
import { serviceRoleClient } from "./fixtures/service-role";

/**
 * Runs once after the whole suite: deletes the ephemeral admin test user
 * global-setup.ts created, and the two tables global-setup + rewards.spec.ts
 * are guaranteed to have written rows to for that user (token_transactions,
 * reward_claims) -- `profiles.id references auth.users(id) on delete
 * cascade` handles the profile row itself, and a handful of other tables
 * (notifications, push_subscriptions, feed_likes, passport_enrollments,
 * trainee_enrollments, team_members) cascade from `profiles` too. Every
 * OTHER table a spec's own fixtures touch (setups, checklist_runs, catering
 * orders, ...) is NOT cascade-deleted from profiles, so each spec file is
 * responsible for deleting its own fixture rows in its own `test.afterAll` --
 * this keeps the live Supabase project clean and keeps this teardown from
 * needing a hardcoded list of every table in the schema. If a spec forgets,
 * the admin user delete below fails with a foreign-key-violation error
 * (loud, in CI logs) instead of silently leaving orphaned rows or an
 * unremovable test user behind.
 */
export default async function globalTeardown() {
  if (!fs.existsSync(ADMIN_INFO_PATH)) return;

  const { userId }: AdminFixtureInfo = JSON.parse(fs.readFileSync(ADMIN_INFO_PATH, "utf-8"));
  const admin = serviceRoleClient();

  const { error: claimsError } = await admin.from("reward_claims").delete().eq("user_id", userId);
  if (claimsError) {
    console.error(`E2E global teardown: failed to delete reward_claims for ${userId}: ${claimsError.message}`);
  }

  const { error: txError } = await admin
    .from("token_transactions")
    .delete()
    .or(`user_id.eq.${userId},created_by.eq.${userId}`);
  if (txError) {
    console.error(`E2E global teardown: failed to delete token_transactions for ${userId}: ${txError.message}`);
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error(
      `E2E global teardown: failed to delete admin test user ${userId}. This usually means a spec left a ` +
        `fixture row referencing this user in some other table (foreign key violation) -- check that every ` +
        `spec's afterAll cleaned up what it created. Underlying error: ${deleteUserError.message}`,
    );
  }

  for (const file of [STORAGE_STATE_PATH, ADMIN_INFO_PATH]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // best-effort cleanup of local fixture files, not worth failing the run over
    }
  }
}
