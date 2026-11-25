import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!accountId || !apiToken) {
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to run isolated offline-POS D1 migration tests.");
}

const apiBase = "https://api.cloudflare.com/client/v4";
const headers = { authorization: "Bearer " + apiToken, "content-type": "application/json" };
async function api(method, path, body) {
  const response = await fetch(apiBase + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const details = (payload.errors ?? []).map((item) => item.message).join("; ");
    throw new Error("Cloudflare D1 API " + method + " " + path + " failed (" + response.status + "): " + details);
  }
  return payload.result;
}

const databaseName = "deverve-offline-migration-test-" + Date.now().toString(36);
let databaseId;
let passed = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  passed += 1;
  console.log("PASS", message);
};
const queryPath = (id) => "/accounts/" + accountId + "/d1/database/" + id + "/query";
async function rows(id, sql) {
  const result = await api("POST", queryPath(id), { sql });
  return (Array.isArray(result) ? result : []).flatMap((item) => item.results ?? []);
}

try {
  const created = await api("POST", "/accounts/" + accountId + "/d1/database", {
    name: databaseName,
    primary_location_hint: "apac",
  });
  databaseId = created.uuid;
  if (!databaseId) throw new Error("Cloudflare did not return the isolated test database ID.");
  console.log("Created isolated D1 migration test database:", databaseName);

  const migrationDirectory = new URL("../migrations/", import.meta.url);
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name))
    .sort((a, b) => Number(a.slice(0, 4)) - Number(b.slice(0, 4)));
  check(migrations.length >= 49, "all numbered schema migrations are present");
  check(migrations.includes("0045_pos_offline_emergency_foundation.sql")
    && migrations.includes("0046_pos_offline_enrollment_challenges.sql")
    && migrations.includes("0047_pos_offline_permit_guards.sql")
    && migrations.includes("0048_pos_offline_permit_snapshot.sql")
    && migrations.includes("0049_pos_offline_private_cost_snapshot.sql"),
  "offline-POS migrations 0045–0049 are included in the isolated migration chain");

  for (const filename of migrations) {
    const sql = await readFile(new URL(filename, migrationDirectory), "utf8");
    if (!sql.trim()) throw new Error("Migration is unexpectedly empty: " + filename);
    await api("POST", queryPath(databaseId), { sql });
    console.log("APPLIED", filename);
  }

  const tableRows = await rows(databaseId,
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pos_offline_%' ORDER BY name");
  const tables = new Set(tableRows.map((row) => row.name));
  const expectedTables = [
    "pos_offline_devices",
    "pos_offline_permits",
    "pos_offline_stock_allocations",
    "pos_offline_events",
    "pos_offline_reconciliation_cases",
    "pos_offline_reconciliation_actions",
    "pos_offline_enrollment_challenges",
  ];
  check(expectedTables.every((name) => tables.has(name)),
    "all seven offline-POS tables are created by migrations 0045–0049");

  const triggerRows = await rows(databaseId,
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'pos_offline_%' ORDER BY name");
  const triggers = new Set(triggerRows.map((row) => row.name));
  const expectedTriggers = [
    "pos_offline_device_identity_immutable",
    "pos_offline_device_no_delete",
    "pos_offline_event_payload_immutable",
    "pos_offline_event_no_delete",
    "pos_offline_reconciliation_action_no_update",
    "pos_offline_reconciliation_action_no_delete",
    "pos_offline_allocation_reserve_on_insert",
    "pos_offline_allocation_guard_update",
    "pos_offline_allocation_reserve_on_update",
    "pos_offline_allocation_no_delete",
    "pos_offline_enrollment_challenge_update_guard",
    "pos_offline_permit_authorization_guard",
    "pos_offline_allocation_insert_guard_during_permit",
    "pos_offline_allocation_release_guard_during_permit",
    "pos_offline_permit_identity_immutable",
    "pos_offline_permit_no_delete",
    "pos_offline_permit_snapshot_guard",
    "pos_offline_permit_snapshot_immutable",
    "pos_offline_permit_cost_snapshot_guard",
    "pos_offline_permit_cost_snapshot_immutable",
  ];
  check(expectedTriggers.every((name) => triggers.has(name)),
    "all immutable-evidence, stock-reservation, enrollment and permit guard triggers are installed");

  const permitColumns = await rows(databaseId, "PRAGMA table_info(pos_offline_permits)");
  check(permitColumns.some((column) => column.name === "snapshot_json"),
    "migration 0048 adds the persisted signed catalogue snapshot column");
  check(permitColumns.some((column) => column.name === "cost_snapshot_json"),
    "migration 0049 stores purchase-cost snapshots privately on the server-side permit record");

  const foreignKeyErrors = await rows(databaseId, "PRAGMA foreign_key_check");
  check(foreignKeyErrors.length === 0,
    "the complete empty-database migration chain has no foreign-key violations");

  // Each query below is a separate Cloudflare D1 API request/connection. This
  // validates the real D1 unique-sequence arbiter under concurrent writers;
  // the real Worker/SQLite suite separately validates the full HTTP lifecycle.
  await api("POST", queryPath(databaseId), {
    sql: "CREATE TABLE pos_offline_d1_race_probe (event_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, device_sequence INTEGER NOT NULL, UNIQUE(device_id, device_sequence))",
  });
  const competingWrites = await Promise.allSettled([
    api("POST", queryPath(databaseId), {
      sql: "INSERT INTO pos_offline_d1_race_probe(event_id,device_id,device_sequence) VALUES ('event-a','device-a',1)",
    }),
    api("POST", queryPath(databaseId), {
      sql: "INSERT INTO pos_offline_d1_race_probe(event_id,device_id,device_sequence) VALUES ('event-b','device-a',1)",
    }),
  ]);
  check(competingWrites.filter((result) => result.status === "fulfilled").length === 1
    && competingWrites.filter((result) => result.status === "rejected").length === 1,
  "independent concurrent D1 requests contending for one device sequence commit exactly one event");
  const raceRows = await rows(databaseId, "SELECT event_id,device_id,device_sequence FROM pos_offline_d1_race_probe");
  check(raceRows.length === 1 && raceRows[0].device_id === "device-a"
    && Number(raceRows[0].device_sequence) === 1,
  "the independent-connection D1 sequence race leaves one canonical row and no duplicate sequence");

  console.log(JSON.stringify({
    status: "passed",
    migrations: migrations.length,
    offline_tables: expectedTables.length,
    offline_guard_triggers: expectedTriggers.length,
    foreign_key_violations: foreignKeyErrors.length,
    independent_connection_sequence_race: "one_winner_one_conflict",
    checks_passed: passed,
  }));
} finally {
  if (databaseId) {
    await api("DELETE", "/accounts/" + accountId + "/d1/database/" + databaseId);
    let deleted = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const databases = await api("GET", "/accounts/" + accountId + "/d1/database?per_page=100");
      if (!(databases ?? []).some((database) => database.uuid === databaseId)) {
        deleted = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!deleted) throw new Error("Temporary offline-POS migration test database still exists after cleanup.");
    console.log("Deleted and verified isolated D1 migration test database:", databaseName);
  }
}
