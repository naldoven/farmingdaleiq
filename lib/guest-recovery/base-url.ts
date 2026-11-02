import { headers } from "next/headers";

import { readConfig } from "@/lib/guest-recovery/providers";

type Env = Record<string, string | undefined>;

/**
 * Picks the address a guest's link should open. NEXT_PUBLIC_APP_URL wins when
 * set. Otherwise the request's host is used only when it is one of this
 * deployment's own known addresses (Vercel sets VERCEL_URL, VERCEL_BRANCH_URL
 * and VERCEL_PROJECT_PRODUCTION_URL), or localhost outside production. A host
 * header is caller-controlled, so anything else is ignored: a forged one must
 * never decide where a copied link or a QR code points. Falls back to the
 * Vercel production address. Pure so it can be tested without a request.
 */
export function pickBaseUrl(host: string | null, env: Env): string | null {
  const configured = readConfig({ NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL }).baseUrl;
  if (configured) return configured;

  const normalized = host?.trim().toLowerCase() ?? "";
  if (normalized) {
    const known = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    if (known.includes(normalized)) return `https://${normalized}`;
    if (env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(normalized)) {
      return `http://${normalized}`;
    }
  }
  return readConfig(env).baseUrl;
}

/** The link address for screens that run inside a request. */
export async function resolveBaseUrl(): Promise<string | null> {
  const h = await headers();
  // Only the Host header: x-forwarded-host is whatever the caller sent unless a
  // trusted proxy overwrote it, and the allowlist above already covers Vercel's own.
  return pickBaseUrl(h.get("host"), process.env);
}
