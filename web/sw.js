// Family Hub service worker — offline shell + last-fetched data window (M7b).
// - SHELL_CACHE: app files (cache-first) so the app boots offline.
// - LIB_CACHE:   cross-origin ES modules (esm.sh) cached on first load.
// - DATA_CACHE:  Supabase REST GETs (network-first, cache fallback) = offline reads.
// Writes (POST/PATCH/RPC) and the realtime socket are never cached.
const VERSION = "v9";
const SHELL_CACHE = "family-hub-shell-" + VERSION;
const LIB_CACHE = "family-hub-libs-" + VERSION;
const DATA_CACHE = "family-hub-data-" + VERSION;
const SHELL = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  const keep = new Set([SHELL_CACHE, LIB_CACHE, DATA_CACHE]);
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return; // POST/PATCH/RPC writes always hit the network
  const url = new URL(request.url);

  // Supabase REST reads → network-first, fall back to the last-cached window offline
  if (url.pathname.startsWith("/rest/v1/")) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Supabase auth/realtime endpoints → always network (don't cache tokens/sockets)
  if (url.hostname.endsWith(".supabase.co")) return;

  // App shell (same origin) → cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(request).then((hit) =>
        hit || fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match("./index.html"))
      )
    );
    return;
  }

  // Cross-origin libs (esm.sh: supabase-js, rrule) → cache-first so the app boots offline
  e.respondWith(
    caches.match(request).then((hit) =>
      hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(LIB_CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
    )
  );
});
