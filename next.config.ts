import type { NextConfig } from "next";

// Applied to every response. These are standard defense-in-depth headers and
// what Lighthouse "best-practices" looks for. A strict CSP is intentionally
// NOT set here: the app relies on Next's inline bootstrap scripts, so a
// nonce-less CSP would break hydration. Adding a nonce-based CSP is a separate,
// higher-risk task tracked outside this perf pass.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Vercel serves the app over HTTPS only; enforce it for two years.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Drop the "X-Powered-By: Next.js" fingerprint.
  poweredByHeader: false,
  async headers() {
    return [
      // Security headers on every route.
      { source: "/:path*", headers: securityHeaders },
      // The service worker must revalidate every load, or a client can get
      // wedged on a stale SW after a deploy. Allow it to control the full scope.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // App icons are stable; let the browser hold them for a week.
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
