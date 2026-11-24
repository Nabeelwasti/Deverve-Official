import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!accountId || !apiToken) {
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for the isolated Cloudflare Worker runtime probe.");
}

const apiBase = "https://api.cloudflare.com/client/v4";
const apiPath = (path) => "/accounts/" + accountId + path;
async function api(method, path, body) {
  const headers = { authorization: "Bearer " + apiToken };
  if (body !== undefined && !(body instanceof FormData)) headers["content-type"] = "application/json";
  const response = await fetch(apiBase + path, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const details = (payload.errors ?? []).map((item) => item.message).join("; ");
    throw new Error("Cloudflare API " + method + " " + path + " failed (" + response.status + "): " + details);
  }
  return payload.result;
}

const suffix = String(process.env.GITHUB_RUN_ID || Date.now().toString(36))
  .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(-24);
const scriptName = ("deverve-runtime-" + suffix).slice(0, 63);
const databaseName = "deverve-runtime-" + suffix;
let databaseId;
let workerCreated = false;
let subdomainEnabled = false;
let failure;
const cleanupErrors = [];

try {
  const created = await api("POST", apiPath("/d1/database"), {
    name: databaseName,
    primary_location_hint: "apac",
  });
  databaseId = created.uuid;
  if (!databaseId) throw new Error("Cloudflare did not return the isolated D1 database ID.");

  const workerCode = await readFile(new URL("../.test-dist/worker/index.js", import.meta.url), "utf8");
  if (!workerCode.includes("api/health")) {
    throw new Error("Compiled production Worker does not contain the health route expected by the runtime probe.");
  }

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({
    main_module: "worker.js",
    compatibility_date: "2026-11-24",
    workers_dev: true,
    bindings: [
      { type: "d1", name: "DB", id: databaseId },
      { type: "r2_bucket", name: "MEDIA", bucket_name: "deverve-db-backups" },
    ],
  })], { type: "application/json" }));
  form.append("worker.js", new Blob([workerCode], { type: "application/javascript+module" }), "worker.js");

  await api("PUT", apiPath("/workers/scripts/" + scriptName), form);
  workerCreated = true;
  const subdomainResult = await api("POST", apiPath("/workers/scripts/" + scriptName + "/subdomain"), {
    enabled: true,
    previews_enabled: false,
  });
  subdomainEnabled = subdomainResult.enabled === true;
  if (!subdomainEnabled) throw new Error("Cloudflare did not enable the isolated Worker subdomain.");

  const accountSubdomain = (await api("GET", apiPath("/workers/subdomain"))).subdomain;
  if (!accountSubdomain) throw new Error("Cloudflare account has no workers.dev subdomain.");
  const url = "https://" + scriptName + "." + accountSubdomain + ".workers.dev/api/health";

  let lastStatus = null;
  let lastBody = "";
  let health;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Deverve-Isolated-Worker-Runtime-Probe/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = response.status;
      lastBody = await response.text();
      if (response.ok) {
        health = JSON.parse(lastBody);
        break;
      }
      if (response.status !== 404 && response.status !== 502 && response.status !== 503) {
        throw new Error("Temporary Cloudflare Worker returned HTTP " + response.status + ": " + lastBody.slice(0, 300));
      }
    } catch (error) {
      if (attempt === 19) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  assert.deepEqual(health, { status: "ok", database: "connected" },
    "the compiled production Worker must execute inside Cloudflare and query its isolated D1 binding");
  console.log(JSON.stringify({
    status: "passed",
    runtime: "Cloudflare Workers",
    d1_binding: "connected",
    isolated_database: true,
    worker_name: scriptName,
    http_status: lastStatus,
  }));
} catch (error) {
  failure = error;
} finally {
  if (subdomainEnabled) {
    await api("POST", apiPath("/workers/scripts/" + scriptName + "/subdomain"), {
      enabled: false,
      previews_enabled: false,
    }).catch((error) => cleanupErrors.push("disable workers.dev: " + error.message));
  }
  if (workerCreated) {
    await api("DELETE", apiPath("/workers/scripts/" + scriptName))
      .catch((error) => cleanupErrors.push("delete temporary Worker: " + error.message));
  } else {
    await api("DELETE", apiPath("/workers/scripts/" + scriptName)).catch(() => {});
  }
  if (databaseId) {
    await api("DELETE", apiPath("/d1/database/" + databaseId))
      .catch((error) => cleanupErrors.push("delete temporary D1: " + error.message));
    const remaining = await api("GET", apiPath("/d1/database?per_page=100")).catch((error) => {
      cleanupErrors.push("verify temporary D1 cleanup: " + error.message);
      return [];
    });
    if ((remaining ?? []).some((database) => database.uuid === databaseId)) {
      cleanupErrors.push("temporary D1 database still exists after cleanup");
    }
  }
}

if (failure) {
  if (cleanupErrors.length) failure.message += " Cleanup issues: " + cleanupErrors.join("; ");
  throw failure;
}
if (cleanupErrors.length) throw new Error("Cloudflare runtime probe cleanup failed: " + cleanupErrors.join("; "));
