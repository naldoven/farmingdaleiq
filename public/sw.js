/**
 * FarmingdaleIQ service worker (P0 PWA shell).
 *
 * - Precaches a minimal app shell so the install banner / offline fallback
 *   have something to serve immediately after install.
 * - Network-first for navigations (page requests), falling back to the
 *   cached offline page when the network is unavailable.
 * - Push + notificationclick skeleton so `lib/notify` has a real target to
 *   send Web Push payloads to once VAPID keys exist (see lib/notify/push.ts).
 */

// Bumped v1 -> v2 (FIQ-13) so the activate handler evicts any already-poisoned
// v1 cache (which may hold the login page under "/" or the offline key).
const CACHE_VERSION = "fiq-shell-v2";
const OFFLINE_URL = "/offline.html";

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
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; let everything else (POST server actions, etc.) pass
  // straight through to the network untouched.
  if (request.method !== "GET") return;

  // Navigations: network-first, offline fallback. Falls back only to the
  // dedicated offline page (never "/", which is auth-gated and not cached).
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Static app-shell assets: cache-first, falling back to network.
  const url = new URL(request.url);
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
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
