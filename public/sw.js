const CACHE_PREFIX = "de-verve-";
const CACHE_NAME = "de-verve-shell-v8";
const SHELL = ["/", "/brand/de-verve-mark.svg"];
const MAX_RUNTIME_ENTRIES = 160;

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_RUNTIME_ENTRIES;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function cacheSuccessfulResponse(cache, request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") return;
  const cacheControl = response.headers.get("cache-control") || "";
  if (/no-store|private/i.test(cacheControl)) return;
  await cache.put(request, response.clone());
  await trimRuntimeCache(cache);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Keep all APIs and mutations network-only. This prevents stale authenticated
  // data or a cached API response from being mistaken for a committed sale.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/manifest.webmanifest"
  ) return;

  const cacheUpdate = async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(request);
    await cacheSuccessfulResponse(cache, request.mode === "navigate" ? "/" : request, response);
  };

  if (request.mode === "navigate") {
    event.waitUntil(cacheUpdate().catch(() => undefined));
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        return await fetch(request);
      } catch {
        return (await cache.match(request)) || (await cache.match("/")) || Response.error();
      }
    })());
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.waitUntil(cacheUpdate().catch(() => undefined));
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return Response.error();
      }
    })());
  }
});
