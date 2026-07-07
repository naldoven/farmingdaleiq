/**
 * Reconstructs the auth cookie `@supabase/ssr`'s `createBrowserClient` /
 * `createServerClient` write for a signed-in session, so Playwright can hand
 * the app a real, valid Supabase session without a UI login form to drive.
 *
 * Why this exists: the app's middleware (lib/supabase/middleware.ts) and
 * every server component read the session via `@supabase/ssr`'s cookie
 * storage, but there is currently no `/login` page (`app/login/page.tsx`
 * does not exist anywhere in this repo -- see the E2E suite's README section
 * in playwright.config.ts) for Playwright to fill in and submit. Building
 * that page is out of this stream's scope (it owns only
 * `supabase/migrations/2026070707xxxx_seed_*.sql`, `e2e/**`,
 * `playwright.config.ts`, `package.json`, `.github/workflows/ci.yml`).
 * Rather than skip authenticated coverage entirely, this reproduces the
 * exact cookie format the installed `@supabase/ssr` version (pinned in
 * package-lock.json) writes, verified by reading its source directly:
 *   - cookie name: `sb-<project-ref>-auth-token`, where `<project-ref>` is
 *     the first label of the Supabase URL's hostname -- see
 *     `defaultStorageKey` in node_modules/@supabase/supabase-js/dist/index.cjs
 *   - cookie value: the literal prefix `base64-` followed by the
 *     base64url encoding of `JSON.stringify(session)` -- see
 *     `BASE64_PREFIX` / `applyServerStorage` in
 *     node_modules/@supabase/ssr/dist/main/cookies.js, and `_saveSession` in
 *     node_modules/@supabase/auth-js/dist/main/GoTrueClient.js (no
 *     `userStorage` configured, so the full session incl. `user` is stored
 *     under one cookie rather than split across a session/user pair)
 *   - default cookie attributes: path "/", sameSite "lax", httpOnly false,
 *     ~400 day maxAge -- see `DEFAULT_COOKIE_OPTIONS` in
 *     node_modules/@supabase/ssr/dist/main/utils/constants.js
 *
 * This was verified end-to-end (not just read from source): a real user was
 * created via the Admin API, signed in via the password grant, and a raw
 * `fetch` to the running app's `/checklists` with only this cookie set
 * returned the authenticated page (not a redirect to `/login`) -- see the
 * PR description / final report for the transcript.
 *
 * Risk: this is undocumented, internal `@supabase/ssr` behavior, not a
 * public API. It is pinned to the exact version in package-lock.json; if
 * that dependency is upgraded and this stops working, the login spec's own
 * assertion (that the target page actually renders authenticated content,
 * not a redirect) will fail loudly rather than silently passing.
 *
 * A session larger than @supabase/ssr's 3180-byte chunk threshold would be
 * split across `sb-<ref>-auth-token`, `sb-<ref>-auth-token.0`, `.1`, ...
 * cookies; this helper does not implement that chunking (real sessions here
 * are well under the threshold -- see the smoke test above), so it throws
 * instead of silently producing a cookie the app can't fully read.
 */
const MAX_CHUNK_SIZE = 3180;

export interface SupabaseSessionLike {
  access_token: string;
  [key: string]: unknown;
}

export function projectRefFromUrl(supabaseUrl: string): string {
  return new URL(supabaseUrl).hostname.split(".")[0];
}

export function authCookieName(supabaseUrl: string): string {
  return `sb-${projectRefFromUrl(supabaseUrl)}-auth-token`;
}

export function authCookieValue(session: SupabaseSessionLike): string {
  const encoded = "base64-" + Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
  // encodeURIComponent mirrors the size check @supabase/ssr's createChunks()
  // applies before deciding to split a cookie into multiple chunks.
  if (encodeURIComponent(encoded).length > MAX_CHUNK_SIZE) {
    throw new Error(
      "E2E fixture session is too large for a single auth cookie (>3180 bytes encoded); " +
        "chunked-cookie reconstruction is not implemented in e2e/fixtures/auth-cookie.ts.",
    );
  }
  return encoded;
}
