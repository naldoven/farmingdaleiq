import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

/**
 * Service-role Supabase client for E2E fixture setup/teardown (creating a
 * checklist run directly, seeding a token balance, cleaning up test data,
 * etc.) -- the same role the app's own `createServiceRoleClient()`
 * (lib/supabase/server.ts) uses for scheduled jobs. Bypasses RLS entirely,
 * so it is only ever used from Node-side test setup/teardown code, never
 * from a page the browser loads.
 */
export function serviceRoleClient(): SupabaseClient<Database> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name} for E2E tests. Copy .env.example to .env.local and fill in the live Supabase project's values.`,
    );
  }
  return value;
}
