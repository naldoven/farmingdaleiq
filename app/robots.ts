import type { MetadataRoute } from "next";

/**
 * FarmingdaleIQ is a private, auth-gated store operations app. It must never be
 * indexed by search engines, so disallow every crawler site-wide. This also
 * gives Lighthouse a syntactically valid robots.txt (the missing file was
 * failing the "robots.txt is valid" audit).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
