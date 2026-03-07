/**
 * Service Worker for API Testing Tool PWA.
 *
 * Strategy:
 *  - Navigation requests: network-first, fallback to cached index.html
 *  - Static assets (JS, CSS, fonts, images): network-first with cache fallback
 *  - API / localhost calls: pass through (never intercept)
 *  - On install, precache the HTML shell
 *  - On every page load the JS/CSS bundles get cached automatically
 *    so offline reloads work after at least one successful visit.
 */

var CACHE_NAME = "api-tester-v4";

var PRECACHE_ASSETS = ["/", "/index.html", "/manifest.json"];

// Install — pre-cache the app shell
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_ASSETS);
    }),
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME;
          })
          .map(function (key) {
            return caches.delete(key);
          }),
      );
    }),
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  // Never intercept API calls, health checks, or localhost/private-network requests.
  // These must go through untouched so the browser can reach local servers even
  // when "offline" (no internet but localhost is still reachable).
  if (url.pathname.startsWith("/api") || url.pathname === "/health") {
    return; // Let the browser handle it natively
  }

  // Don't intercept requests to different origins (e.g. localhost API calls)
  if (url.origin !== self.location.origin) {
    return;
  }

  // For navigation requests: network-first, fall back to cached index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          // Cache the latest HTML
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(function () {
          return caches.match("/index.html").then(function (cached) {
            return cached || new Response("Offline", { status: 503 });
          });
        }),
    );
    return;
  }

  // For static assets (JS, CSS, images, fonts): network-first with cache fallback.
  // This ensures fresh assets after a rebuild, but still works offline.
  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response.ok && request.method === "GET") {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          if (request.destination === "document") {
            return caches.match("/index.html");
          }
          return new Response("", { status: 503, statusText: "Offline" });
        });
      }),
  );
});
