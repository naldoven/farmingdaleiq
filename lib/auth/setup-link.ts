import { resolveBaseUrl } from "@/lib/guest-recovery/base-url";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Setup links: how a manager gets a person into the app without email
 * (docs/STAFF-SIGN-IN-PLAN.md, Step 1). Server-only: it uses the service-role
 * client. Callers must have already passed requirePermission("people.manage")
 * and the rank guard.
 *
 * `generateLink` sends NO email, so Supabase's built-in 2-per-hour email cap
 * never applies. A new recovery link replaces any older one for that person.
 *
 * The link points at /auth/confirm, not /auth/callback: /auth/confirm only
 * shows a button, and the one-time token is spent when the person taps it.
 * Text and email apps open links to build previews, and on 2026-11-16 those
 * previews used up every texted link before anyone tapped it.
 *
 * Never log, store or audit the link. It is a working key to the account.
 */

export function buildSetupLink(baseUrl: string, hashedToken: string): string {
  const url = new URL("/auth/confirm", baseUrl);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

export async function makeSetupLink(email: string): Promise<string> {
  // Resolve the address first: a link with no trusted host must never be made.
  const baseUrl = await resolveBaseUrl();
  if (!baseUrl) {
    throw new Error("The app address is not set up (NEXT_PUBLIC_APP_URL).");
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    throw new Error("Could not make a setup link. Try again.");
  }
  return buildSetupLink(baseUrl, hashedToken);
}
