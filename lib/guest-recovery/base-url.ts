import { headers } from "next/headers";

import { readConfig } from "@/lib/guest-recovery/providers";

/**
 * The address a guest's link should open, for screens that run inside a request.
 * NEXT_PUBLIC_APP_URL wins when set. Otherwise the address the leader is on right
 * now, so a preview deployment or a local run builds working links; the Vercel
 * production address is the last resort. Null only when none of them is known.
 */
export async function resolveBaseUrl(): Promise<string | null> {
  const config = readConfig({ NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL });
  if (config.baseUrl) return config.baseUrl;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
    return `${local ? "http" : "https"}://${host}`;
  }
  return readConfig().baseUrl;
}
