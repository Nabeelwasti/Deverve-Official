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

const missing = {};
for (const name of names) {
  const binding = existing[name];
  if (binding && binding.type !== "secret_text") {
    throw new Error(name + " already exists but is not stored as an encrypted secret; refusing to overwrite or silently accept it.");
  }
  if (!binding) missing[name] = { type: "secret_text", value: randomBytes(32).toString("hex") };
}

if (Object.keys(missing).length) {
  await request("PATCH", { deployment_configs: { production: { env_vars: missing } } });
}

const after = await request("GET");
const configured = after.deployment_configs?.production?.env_vars || {};
for (const name of names) {
  if (configured[name]?.type !== "secret_text") {
    throw new Error("Cloudflare did not confirm the " + name + " encrypted secret binding.");
  }
}
console.log(Object.keys(missing).length
  ? "Provisioned independent random 256-bit AI vault and CNIC preview secrets without overwriting existing bindings."
  : "Independent AI vault and CNIC preview secrets were already provisioned; no secret was rotated.");
console.log("Confirmed encrypted secret names:", names.join(", "));
