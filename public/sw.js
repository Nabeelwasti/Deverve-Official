const CACHE_PREFIX = "de-verve-";
const CACHE_NAME = "de-verve-shell-v8";
const SHELL = ["/", "/brand/de-verve-mark.svg"];
const MAX_RUNTIME_ENTRIES = 160;

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  const protectedKeys = new Set(SHELL);
  const runtimeKeys = keys.filter((key) => !protectedKeys.has(new URL(key.url).pathname));
  const excess = runtimeKeys.length - MAX_RUNTIME_ENTRIES;
  if (excess > 0) await Promise.all(runtimeKeys.slice(0, excess).map((key) => cache.delete(key)));
}

async function cacheSuccessfulResponse(cache, request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") return;
  const cacheControl = response.headers.get("cache-control") || "";
  if (/no-store|private/i.test(cacheControl)) return;
  try {
    await cache.put(request, response.clone());
    await trimRuntimeCache(cache);
  } catch {
    // A full or unavailable cache must never turn a successful online request
    // into an application failure; offline readiness will remain unavailable.
  }
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

  // APIs, authentication and all non-GET operations remain network-only.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/manifest.webmanifest"
  ) return;

  const cacheKey = request.mode === "navigate" ? "/" : request;
  const network = fetch(request).then(async (response) => {
    const cache = await caches.open(CACHE_NAME);
    await cacheSuccessfulResponse(cache, cacheKey, response);
    return response;
  });

  event.waitUntil(network.then(() => undefined).catch(() => undefined));

  if (request.mode === "navigate") {
    event.respondWith(network.catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || (await cache.match("/")) || Response.error();
    }));
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || network.catch(() => Response.error());
    })());
  }
});
