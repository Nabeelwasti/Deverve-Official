import assert from "node:assert/strict";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { afterEach, beforeEach } from "node:test";
import { handleRequest } from "../.test-dist/worker/index.js";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const root = resolve(import.meta.dirname, "..");
const origin = "https://offline-pos.integration.test";
const ownerId = "10000000-0000-4000-8000-000000000001";
const registerId = "20000000-0000-4000-8000-000000000001";
const token = "offline-pos-integration-session-token";
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const sha256 = (value) => createHash("sha256").update(value).digest("base64url");

class LocalD1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  all() { return { success: true, results: this.db.prepare(this.sql).all(...this.values) }; }
  run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) } };
  }
}
class LocalD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new LocalD1Statement(this.db, sql); }
  batch(statements) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

let sqlite, db, env, cookie;
beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = readdirSync(join(root, "migrations")).filter((name) => /^\\d{4}_.+\\.sql$/.test(name)).sort();
  assert.equal(migrations.length, 49, "expected the complete numbered migration chain");
  for (const name of migrations) sqlite.exec(readFileSync(join(root, "migrations", name), "utf8"));
  db = new LocalD1(sqlite);
  const expires = new Date(Date.now() + 60 * 60_000).toISOString();
  sqlite.prepare("INSERT INTO admin_users (id,email,password_hash,role) VALUES (?,?,?,'owner')").run(ownerId, "owner@integration.test", "test-only-not-used");
  sqlite.prepare("INSERT INTO admin_sessions (id,admin_user_id,token_hash,expires_at) VALUES (?,?,?,?)").run(randomUUID(), ownerId, sha256(token), expires);
  sqlite.prepare("INSERT INTO pos_registers (id,name,location_label,is_active) VALUES (?,?,?,1)").run(registerId, "Integration register", "Isolated test database");
  env = {
    DB: db,
    MEDIA: { put: async () => {}, get: async () => null, head: async () => null, delete: async () => {} },
    POS_OFFLINE_PERMIT_PRIVATE_JWK: "",
    POS_OFFLINE_PERMIT_PUBLIC_JWK: "",
    OFFLINE_POS_CHECKOUT_ENABLED: "false",
  };
  cookie = "__Host-deverve_admin=" + token;
});
afterEach(() => { sqlite?.close(); });

async function api(path, body, method = "POST") {
  return handleRequest(new Request(origin + path, {
    method,
    headers: { origin, cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
}
async function createIdentity() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const canonicalPublic = JSON.stringify({ crv: "P-256", kty: "EC", x: publicJwk.x, y: publicJwk.y });
  const thumbprint = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPublic)));
  return { pair, publicJwk, thumbprint };
}
async function enrollPayload(identity, challenge, challengeId, deviceId) {
  const message = "deverve-offline-pos:enroll:v1\\n" + challenge;
  const signature = b64url(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, identity.pair.privateKey, new TextEncoder().encode(message)));
  return {
    device_id: deviceId, register_id: registerId, device_label: "CI isolated device",
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
    challenge_id: challengeId, challenge, signature,
  };
}

test("real Worker creates a one-time challenge bound to register, device and P-256 key", async () => {
  const identity = await createIdentity(), deviceId = randomUUID();
  const response = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: deviceId, register_id: registerId,
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.challenge_id, /^[a-f0-9-]{36}$/i);
  assert.match(payload.challenge, /^[A-Za-z0-9_-]{43}$/);
  const row = sqlite.prepare("SELECT device_id,register_id,public_key_thumbprint,challenge_hash,consumed_at FROM pos_offline_enrollment_challenges WHERE id=?").get(payload.challenge_id);
  assert.equal(row.device_id, deviceId);
  assert.equal(row.register_id, registerId);
  assert.equal(row.public_key_thumbprint, identity.thumbprint);
  assert.equal(row.challenge_hash, sha256(payload.challenge));
  assert.equal(row.consumed_at, null);
});

test("real Worker rejects a forged proof and leaves the challenge available for the genuine device", async () => {
  const identity = await createIdentity(), attacker = await createIdentity(), deviceId = randomUUID();
  const challengeResponse = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: deviceId, register_id: registerId,
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
  });
  const challenge = await challengeResponse.json();
  const forged = await enrollPayload(attacker, challenge.challenge, challenge.challenge_id, deviceId);
  const rejected = await api("/api/admin/pos/offline/devices/enroll", forged);
  assert.equal(rejected.status, 403);
  assert.equal(sqlite.prepare("SELECT consumed_at FROM pos_offline_enrollment_challenges WHERE id=?").get(challenge.challenge_id).consumed_at, null);
  const valid = await api("/api/admin/pos/offline/devices/enroll", await enrollPayload(identity, challenge.challenge, challenge.challenge_id, deviceId));
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).enrolled, true);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_devices WHERE id=?").get(deviceId).status, "active");
});

test("real Worker consumes enrollment challenge exactly once and rejects replay", async () => {
  const identity = await createIdentity(), deviceId = randomUUID();
  const challengeResponse = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: deviceId, register_id: registerId,
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
  });
  const challenge = await challengeResponse.json();
  const payload = await enrollPayload(identity, challenge.challenge, challenge.challenge_id, deviceId);
  const first = await api("/api/admin/pos/offline/devices/enroll", payload);
  assert.equal(first.status, 200);
  const replay = await api("/api/admin/pos/offline/devices/enroll", payload);
  assert.equal(replay.status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_devices WHERE id=?").get(deviceId).count, 1);
  assert.ok(sqlite.prepare("SELECT consumed_at FROM pos_offline_enrollment_challenges WHERE id=?").get(challenge.challenge_id).consumed_at);
});

test("real Worker rejects mismatched key thumbprints and unknown registers", async () => {
  const identity = await createIdentity();
  const mismatch = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: randomUUID(), register_id: registerId,
    public_key_jwk: identity.publicJwk, public_key_thumbprint: "A".repeat(43),
  });
  assert.equal(mismatch.status, 400);
  const unknownRegister = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: randomUUID(), register_id: randomUUID(),
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
  });
  assert.equal(unknownRegister.status, 404);
});
