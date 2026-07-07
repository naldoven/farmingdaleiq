/**
 * Guards a post-auth redirect target so a `?next=` query param (or any
 * caller-supplied "return to" value) can never bounce the browser to an
 * attacker-controlled origin (open-redirect / phishing).
 *
 * Only same-origin, absolute relative paths are allowed: the value must start
 * with a single "/" and must not be protocol-relative ("//host") or use the
 * backslash trick ("/\\host") that browsers normalize to "//host". Anything
 * that fails - a full URL, an empty value, a bare word, or a control-character
 * smuggle - falls back to `fallback` (default "/").
 */
export function safeRedirect(
  next: string | null | undefined,
  fallback = "/",
): string {
  if (typeof next !== "string" || next.length === 0) {
    return fallback;
  }
  // Must be an absolute same-origin path.
  if (next[0] !== "/") {
    return fallback;
  }
  // Reject protocol-relative ("//evil.com") and backslash variants
  // ("/\\evil.com") that user agents treat as a new host.
  if (next[1] === "/" || next[1] === "\\") {
    return fallback;
  }
  // Reject control chars (code points below 0x20 - tab, newline, NUL, etc. -
  // and the 0x7f delete char) that can smuggle a scheme or break URL parsing.
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return fallback;
    }
  }
  return next;
}
