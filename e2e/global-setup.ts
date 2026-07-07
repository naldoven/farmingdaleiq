import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { FullConfig } from "@playwright/test";

import { authCookieName, authCookieValue } from "./fixtures/auth-cookie";
import { requireEnv, serviceRoleClient } from "./fixtures/service-role";

export const AUTH_DIR = path.join(__dirname, ".auth");
export const STORAGE_STATE_PATH = path.join(AUTH_DIR, "admin-storage-state.json");
export const ADMIN_INFO_PATH = path.join(AUTH_DIR, "admin-user.json");

export interface AdminFixtureInfo {
  userId: string;
  email: string;
}

/**
 * Runs once before the whole suite: creates a single ephemeral admin test
 * user via the Supabase Auth Admin API (service role), elevates it to the
 * Location Manager role so every permission-gated page/action is reachable,
 * gives it a starting token balance for the rewards-claim spec, signs in for
 * real, and writes a Playwright storageState carrying the resulting session
 * cookie (see e2e/fixtures/auth-cookie.ts for why a cookie is hand-built
 * instead of driving a login form). global-teardown.ts deletes this user
 * afterwards.
 */
export default async function globalSetup(config: FullConfig) {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const admin = serviceRoleClient();

  const email = `e2e-admin+${Date.now()}-${randomUUID().slice(0, 8)}@farmingdaleiq.test`;
  const password = randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "E2E Admin" },
  });
  if (createError || !created.user) {
    throw new Error(`E2E global setup: failed to create admin test user: ${createError?.message}`);
  }
  const userId = created.user.id;

  // The seeded role list (supabase/migrations/20260707001900_seed_store_config.sql)
  // always includes "Location Manager", the top of the rank ladder -- see
  // that migration if this ever needs to change.
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("name", "Location Manager")
    .maybeSingle();
  if (roleError || !role) {
    throw new Error(
      `E2E global setup: could not find the "Location Manager" role (has the store-config seed migration run?): ${roleError?.message}`,
    );
  }

  // handle_new_auth_user() (supabase/migrations/20260707000200_core.sql)
  // already created a bare profile row synchronously inside the createUser
  // transaction; elevate it to full admin permissions for this run.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role_id: role.id, name: "E2E Admin" })
    .eq("id", userId);
  if (profileError) {
    throw new Error(`E2E global setup: failed to elevate admin test user's profile: ${profileError.message}`);
  }

  // Starting token balance so rewards.spec.ts can claim a reward without
  // wiring a whole checklist/task completion chain just to earn tokens.
  const { error: tokenError } = await admin.from("token_transactions").insert({
    user_id: userId,
    delta: 500,
    kind: "adjust",
    note: "E2E fixture starting balance",
    created_by: userId,
  });
  if (tokenError) {
    throw new Error(`E2E global setup: failed to seed admin test user's token balance: ${tokenError.message}`);
  }

  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!tokenRes.ok) {
    throw new Error(`E2E global setup: admin test user sign-in failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const session = await tokenRes.json();

  const baseURL = config.projects[0]?.use?.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const domain = new URL(baseURL).hostname;

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify(
      {
        cookies: [
          {
            name: authCookieName(supabaseUrl),
            value: authCookieValue(session),
            domain,
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60,
            httpOnly: false,
            secure: false,
            sameSite: "Lax" as const,
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );

  const adminInfo: AdminFixtureInfo = { userId, email };
  fs.writeFileSync(ADMIN_INFO_PATH, JSON.stringify(adminInfo, null, 2));
}
