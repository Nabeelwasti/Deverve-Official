import { randomBytes } from "node:crypto";

const token = process.env.CLOUDFLARE_API_TOKEN || "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
if (!token || !accountId) {
  throw new Error("Cloudflare credentials are required.");
}

const names = ["AI_KEYS_ENCRYPTION_KEY", "CNIC_PREVIEW_HMAC_KEY"];
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/deverve-official`;
const request = async (method, body) => {
  const response = await fetch(base, {
    method,
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    const codes = (data.errors || []).map((item) => item.code).join(",");
    throw new Error("Cloudflare Pages secret provisioning failed (HTTP " + response.status + ", codes " + codes + ").");
  }
  return data.result;
};

const before = await request("GET");
const existing = before.deployment_configs?.production?.env_vars || {};
if (!existing.ADMIN_BOOTSTRAP_TOKEN || !existing.NabeelG_Api_key1) {
  throw new Error("Existing production bootstrap and Gemini bindings were not found; refusing to alter project settings.");
}

const markerName = "APP_SECRET_HIERARCHY_VERSION";
const marker = existing[markerName];
const present = names.filter((name) => Boolean(existing[name]));
for (const name of present) {
  if (existing[name].type !== "secret_text") {
    throw new Error(name + " already exists but is not stored as an encrypted secret; refusing to overwrite or silently accept it.");
  }
}
if (marker && marker.value !== "1") {
  throw new Error("An unknown application secret hierarchy version is configured; refusing to change secrets.");
}
if (marker && present.length !== names.length) {
  throw new Error("The application secret hierarchy marker exists but a required secret is missing. Refusing to generate a replacement that could make stored ciphertext unrecoverable.");
}
if (!marker && present.length > 0) {
  throw new Error("A partial application secret hierarchy exists without its version marker. Refusing to overwrite or complete it automatically.");
}

const missing = {};
if (!marker) {
  for (const name of names) missing[name] = { type: "secret_text", value: randomBytes(32).toString("hex") };
  missing[markerName] = { type: "plain_text", value: "1" };
  await request("PATCH", { deployment_configs: { production: { env_vars: missing } } });
}

const after = await request("GET");
const configured = after.deployment_configs?.production?.env_vars || {};
for (const name of names) {
  if (configured[name]?.type !== "secret_text") {
    throw new Error("Cloudflare did not confirm the " + name + " encrypted secret binding.");
  }
}
if (configured[markerName]?.value !== "1") {
  throw new Error("Cloudflare did not confirm the application secret hierarchy marker.");
}
console.log(marker ? "Independent AI vault and CNIC preview secrets were already provisioned; no secret was rotated." : "Provisioned independent random 256-bit AI vault and CNIC preview secrets and wrote the non-secret hierarchy marker.");
console.log("Confirmed encrypted secret names:", names.join(", "));
