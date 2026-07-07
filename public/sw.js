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

const CACHE_VERSION = "fiq-shell-v1";
const OFFLINE_URL = "/offline.html";

const APP_SHELL = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
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

  // Navigations: network-first, offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res ?? caches.match("/")),
      ),
    );
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
