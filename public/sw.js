const CACHE_PREFIX = "de-verve-";
const CACHE_NAME = "de-verve-shell-v9";
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

function isSafePosAsset(candidate) {
  try {
    const url = new URL(candidate, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    if (url.pathname === "/") return url;
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/api/") ||
        url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest") return null;
    if (!/\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !["PRECACHE_POS_ASSETS", "CHECK_POS_ASSETS"].includes(data.type)) return;
  const port = event.ports && event.ports[0];
  const work = (async () => {
    const requested = Array.isArray(data.urls) ? data.urls.slice(0, 120) : [];
    const safeUrls = Array.from(new Set([...SHELL, ...requested].map((candidate) => isSafePosAsset(candidate)?.href).filter(Boolean)));
    const cache = await caches.open(CACHE_NAME);
    const cached = [];
    const missing = [];
    const failed = [];
    for (const href of safeUrls) {
      if (data.type === "CHECK_POS_ASSETS") {
        if (await cache.match(href)) cached.push(href);
        else missing.push(href);
        continue;
      }
      try {
        const response = await fetch(new Request(href, { method: "GET", credentials: "same-origin", cache: "reload" }));
        if (!response || response.status !== 200 || response.type === "opaque" ||
            /no-store|private/i.test(response.headers.get("cache-control") || "")) {
          failed.push(href);
          continue;
        }
        await cache.put(href, response.clone());
        cached.push(href);
      } catch {
        failed.push(href);
      }
    }
    await trimRuntimeCache(cache);
    return { ready: missing.length === 0 && failed.length === 0, cached, missing, failed, cacheName: CACHE_NAME };
  })();
  event.waitUntil(work.then((result) => {
    try { port?.postMessage(result); } catch {}
  }).catch(() => {
    try { port?.postMessage({ ready: false, cached: [], missing: [], failed: ["service_worker_cache_error"], cacheName: CACHE_NAME }); } catch {}
  }));
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
