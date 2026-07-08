/**
 * FarmingdaleIQ service worker.
 *
 * - Precaches a minimal app shell so the install banner / offline fallback
 *   have something to serve immediately after install.
 * - Network-first for navigations (page requests), falling back to the
 *   cached offline page when the network is unavailable.
 * - Stale-while-revalidate for content-hashed build output + static media so
 *   repeat visits paint from cache instantly while refreshing in the
 *   background. Hashed URLs are immutable, so a cached hit is always correct.
 * - Push + notificationclick so lib/notify has a real Web Push target.
 */

// Bumped v2 -> v3 (perf pass) so the activate handler evicts the older shell
// cache and the new runtime cache name takes effect.
const CACHE_VERSION = "fiq-shell-v3";
// Runtime cache for content-hashed static assets (see staleWhileRevalidate).
const RUNTIME_CACHE = "fiq-runtime-v1";
// Both caches survive activation cleanup; anything else is an old version.
const KEEP_CACHES = [CACHE_VERSION, RUNTIME_CACHE];
const OFFLINE_URL = "/offline.html";

// Same-origin static assets safe to serve stale: content-hashed build chunks,
// fonts, icons, and images. HTML is never matched here (navigations are
// handled above, network-first) so an auth-gated page is never cached.
const STATIC_ASSET_RE = /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp|avif)$/;

// "/" is intentionally NOT precached: it is auth-gated and user-specific, so
// caching it would serve a stale/foreign home or (pre-auth) the login page.
const APP_SHELL = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "no-store" });
            // Only cache a real, non-redirected 200. A followed auth redirect
            // (response.redirected) would otherwise poison the shell with the
            // login page (FIQ-13).
            if (response.ok && !response.redirected) {
              await cache.put(url, response.clone());
            }
          } catch {
            // Offline for this asset during install; skip it.
          }
        }),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !KEEP_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: serve the cached copy immediately (if any) and
// refresh it from the network in the background for next time. Only a real
// 200 is written back, so a network error never poisons the cache.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; let everything else (POST server actions, etc.) pass
  // straight through to the network untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations: network-first, offline fallback. Falls back only to the
  // dedicated offline page (never "/", which is auth-gated and not cached).
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Precached minimal shell assets: cache-first.
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
    return;
  }

  // Content-hashed build output + static media (same-origin): SWR. This is
  // what makes repeat loads instant. Cross-origin (e.g. Supabase API) is left
  // untouched so it always hits the network.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || STATIC_ASSET_RE.test(url.pathname))
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// --- Web Push -------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "FarmingdaleIQ", body: event.data.text() };
  }

  const title = payload.title || "FarmingdaleIQ";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { link: payload.link || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = event.notification.data?.link || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(link) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(link);
        }
      }),
  );
});
