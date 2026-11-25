import { hkdfSync } from "node:crypto";

const token = process.env.CLOUDFLARE_API_TOKEN || "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const rootHex = process.env.D1_BACKUP_ENCRYPTION_KEY || "";
if (!token || !accountId || !/^[a-f0-9]{64}$/i.test(rootHex)) {
  throw new Error("Cloudflare credentials or the 32-byte backup root key are missing or invalid.");
}

const root = Buffer.from(rootHex, "hex");
const salt = Buffer.from("deverve-secret-separation-v1", "utf8");
const derive = (purpose) => Buffer.from(hkdfSync("sha256", root, salt, Buffer.from("deverve/" + purpose + "/v1", "utf8"), 32)).toString("hex");
const envVars = {
  AI_KEYS_ENCRYPTION_KEY: { type: "secret_text", value: derive("ai-provider-key-vault") },
  CNIC_PREVIEW_HMAC_KEY: { type: "secret_text", value: derive("rental-cnic-preview-hmac") },
};
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/deverve-official`;
const request = async (method, body) => {
  const response = await fetch(base, {
    method,
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
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
await request("PATCH", { deployment_configs: { production: { env_vars: envVars } } });
const after = await request("GET");
const configured = after.deployment_configs?.production?.env_vars || {};
for (const name of Object.keys(envVars)) {
  if (configured[name]?.type !== "secret_text") throw new Error("Cloudflare did not confirm the " + name + " secret binding.");
}
console.log("Provisioned domain-separated AI vault and CNIC preview secrets. Existing production secrets were preserved.");
console.log("Configured secret names:", Object.keys(envVars).join(", "));
