import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { loadEnvLocal } from "./e2e/fixtures/load-env";
import { STORAGE_STATE_PATH } from "./e2e/global-setup";

loadEnvLocal(__dirname);

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E suite (PLAN.md Phase 2 item 3). Runs the real app (built + started, see
 * `webServer` below) against the LIVE Supabase project -- there is no local
 * Supabase stack in this repo. `e2e/global-setup.ts` creates one ephemeral
 * admin test user via the service-role Admin API and signs it in for real;
 * `e2e/global-teardown.ts` deletes it. See e2e/fixtures/auth-cookie.ts for
 * why authenticated specs use a hand-built session cookie rather than
 * driving a login form: there is currently no `/login` page in this repo for
 * Playwright to submit (`app/(app)/layout.tsx` redirects there, but
 * `app/login/page.tsx` does not exist -- out of this stream's scope to add,
 * flagged in the final report instead).
 *
 * Required env (from `.env.local` locally, or repo secrets in CI -- see
 * `.github/workflows/ci.yml`'s `e2e` job): NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Without these the
 * whole run fails fast in global setup rather than limping through with
 * placeholder values.
 */
export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: require.resolve("./e2e/global-setup"),
  globalTeardown: require.resolve("./e2e/global-teardown"),
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "unauthenticated",
      testMatch: /login\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated",
      testIgnore: /login\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE_PATH },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    // A bare "/" or any authenticated route 307-redirects to /login when
    // signed out (this fixture server always starts signed-out), and
    // Playwright's webServer readiness probe only treats a 2xx response as
    // "ready" -- pointing it at a redirecting URL means it never detects the
    // server as up and always re-attempts the command, colliding with an
    // already-running instance (EADDRINUSE) instead of reusing it. The PWA
    // manifest is a genuinely public, always-200 route, so it's a reliable
    // readiness check independent of auth state.
    url: `${BASE_URL}/manifest.webmanifest`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    cwd: path.resolve(__dirname),
  },
});
