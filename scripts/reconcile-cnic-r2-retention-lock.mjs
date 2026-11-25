const API = "https://api.cloudflare.com/client/v4";
const token = process.env.CLOUDFLARE_API_TOKEN || "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const healthUrl = "https://deverve-cnic-retention.wastinabeel99.workers.dev/health";
const bucket = "deverve-media-private";
const targetId = "deverve-rental-cnic-indefinite";

if (!token || !accountId) throw new Error("Cloudflare credentials are required.");

async function request(method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: { authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    const codes = (data.errors || []).map((item) => item.code).join(",");
    throw new Error("Cloudflare retention-policy request failed (HTTP " + response.status + ", codes " + codes + ").");
  }
  return data.result;
}

const healthResponse = await fetch(healthUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
const health = await healthResponse.json().catch(() => ({}));
if (!healthResponse.ok ||
    health.status !== "ok" ||
    health.database_connected !== true ||
    health.private_storage_binding !== true ||
    health.document_retention !== "90_days_after_owner_or_manager_clearance" ||
    health.automatic_deletion_requires_due_clearance_and_no_active_hold !== true) {
  throw new Error("The deployed CNIC retention Worker did not pass its production health and policy gate. R2 lock rules were not changed.");
}

const schedules = await request("GET", "/accounts/" + accountId + "/workers/scripts/deverve-cnic-retention/schedules");
const cronExpressions = (schedules.schedules || []).map((item) => item.cron);
if (!cronExpressions.includes("0 3 * * *")) {
  throw new Error("The daily 03:00 UTC CNIC retention Cron Trigger is not confirmed; R2 lock rules were not changed.");
}

const path = "/accounts/" + accountId + "/r2/buckets/" + bucket + "/lock";
const before = await request("GET", path);
const rules = Array.isArray(before.rules) ? before.rules : [];
const matches = rules.filter((rule) => rule.id === targetId);
if (matches.length === 0) {
  console.log("The known indefinite CNIC lock rule is already absent; no R2 policy change was required.");
} else {
  const rule = matches[0];
  if (matches.length !== 1 ||
      rule.enabled !== true ||
      rule.prefix !== "rental-private/" ||
      rule.condition?.type !== "Indefinite") {
    throw new Error("The existing CNIC lock rule does not match the reviewed policy; refusing to change R2 lock configuration.");
  }
  const remaining = rules.filter((item) => item.id !== targetId);
  await request("PUT", path, { rules: remaining });
}
const after = await request("GET", path);
if ((after.rules || []).some((rule) => rule.id === targetId && rule.enabled === true)) {
  throw new Error("The indefinite CNIC lock rule remains enabled; automatic retention deletion is still blocked.");
}
console.log("Verified the 90-day retention Worker and removed only the reviewed indefinite rental-private R2 lock rule. No objects were deleted by this policy update.");
