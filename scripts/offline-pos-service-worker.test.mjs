import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

// Parse the actual service-worker source as JavaScript, not just a text fixture.
assert.doesNotThrow(() => new vm.Script(source, { filename: "public/sw.js" }));

assert.match(source, /const CACHE_PREFIX = "de-verve-"/);
assert.match(source, /const CACHE_NAME = "de-verve-shell-v9"/);
assert.match(source, /const SHELL = \["\/", "\/brand\/de-verve-mark\.svg"\]/);
assert.match(source, /MAX_RUNTIME_ENTRIES/);
assert.match(source, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
assert.match(source, /protectedKeys = new Set\(SHELL\)/);
assert.match(source, /response\.status !== 200/);
assert.match(source, /no-store\|private/i);
assert.match(source, /request\.method !== "GET"/);
assert.match(source, /url\.origin !== self\.location\.origin/);
assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
assert.match(source, /url\.pathname === "\/manifest\.webmanifest"/);
assert.match(source, /event\.waitUntil\(network\.then\(\(\) => undefined\)\.catch\(\(\) => undefined\)\)/);
assert.match(source, /cache\.match\(request\).*cache\.match\("\/"\)/s);
assert.match(source, /\["script", "style", "image", "font"\]/);
assert.match(source, /PRECACHE_POS_ASSETS/);
assert.match(source, /CHECK_POS_ASSETS/);
assert.match(source, /function isSafePosAsset/);
assert.match(source, /credentials: "same-origin"/);
assert.match(source, /await cache\.put\(href, response\.clone\(\)\)/);
assert.match(source, /event\.waitUntil\(work\.then/);


// The service worker must never cache API responses or non-GET requests.
const fetchHandler = source.slice(source.indexOf('self.addEventListener("fetch"'));
assert.ok(fetchHandler.indexOf('request.method !== "GET"') < fetchHandler.indexOf("const cacheKey"));
assert.ok(fetchHandler.indexOf('url.pathname.startsWith("/api/")') < fetchHandler.indexOf("const cacheKey"));

console.log("Emergency POS service-worker cache safety checks passed.");
