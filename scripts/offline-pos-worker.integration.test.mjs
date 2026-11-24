import assert from "node:assert/strict";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { afterEach, beforeEach } from "node:test";
import { handleRequest, verifyOfflinePermitSignatureServer } from "../.test-dist/worker/index.js";

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
  const migrations = readdirSync(join(root, "migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
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
async function enrollPayload(signer, challenge, challengeId, deviceId, claimedIdentity = signer) {
  const message = "deverve-offline-pos:enroll:v1\n" + challenge;
  const signature = b64url(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signer.pair.privateKey, new TextEncoder().encode(message)));
  return {
    device_id: deviceId, register_id: registerId, device_label: "CI isolated device",
    public_key_jwk: claimedIdentity.publicJwk, public_key_thumbprint: claimedIdentity.thumbprint,
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
  const forged = await enrollPayload(attacker, challenge.challenge, challenge.challenge_id, deviceId, identity);
  const rejected = await api("/api/admin/pos/offline/devices/enroll", forged);
  assert.equal(rejected.status, 403);
  assert.equal(sqlite.prepare("SELECT consumed_at FROM pos_offline_enrollment_challenges WHERE id=?").get(challenge.challenge_id).consumed_at, null);
  const valid = await api("/api/admin/pos/offline/devices/enroll", await enrollPayload(identity, challenge.challenge, challenge.challenge_id, deviceId));
  assert.equal(valid.status, 201);
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
  assert.equal(first.status, 201);
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


test("real Worker rejects an expired enrollment challenge without creating a device", async () => {
  const identity = await createIdentity(), deviceId = randomUUID();
  const challengeId = randomUUID(), challenge = b64url(crypto.getRandomValues(new Uint8Array(32)));
  sqlite.prepare("INSERT INTO pos_offline_enrollment_challenges (id,device_id,register_id,public_key_thumbprint,challenge_hash,expires_at,created_by_admin_id,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(challengeId, deviceId, registerId, identity.thumbprint, sha256(challenge),
      "2000-01-02T00:00:00.000Z", ownerId, "2000-01-01T00:00:00.000Z");
  const expired = await api("/api/admin/pos/offline/devices/enroll",
    await enrollPayload(identity, challenge, challengeId, deviceId));
  assert.equal(expired.status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_devices WHERE id=?").get(deviceId).count, 0);
  assert.equal(sqlite.prepare("SELECT consumed_at FROM pos_offline_enrollment_challenges WHERE id=?").get(challengeId).consumed_at, null);
});

test("real Worker revokes an enrolled device, records the actor and audit evidence, and makes repeat revocation idempotent", async () => {
  const identity = await createIdentity(), deviceId = randomUUID();
  const challengeResponse = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: deviceId, register_id: registerId,
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
  });
  const challenge = await challengeResponse.json();
  const enrolled = await api("/api/admin/pos/offline/devices/enroll",
    await enrollPayload(identity, challenge.challenge, challenge.challenge_id, deviceId));
  assert.equal(enrolled.status, 201);

  const missingReason = await api("/api/admin/pos/offline/devices/" + deviceId + "/revoke", {});
  assert.equal(missingReason.status, 400);
  const revoked = await api("/api/admin/pos/offline/devices/" + deviceId + "/revoke", {
    reason: "Device reported lost during integration test",
  });
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).revoked, true);
  const device = sqlite.prepare("SELECT status,revoked_by_admin_id,revoked_at FROM pos_offline_devices WHERE id=?").get(deviceId);
  assert.equal(device.status, "revoked");
  assert.equal(device.revoked_by_admin_id, ownerId);
  assert.ok(device.revoked_at);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='pos.offline_device_revoked' AND entity_id=?").get(deviceId).count, 1);

  const repeated = await api("/api/admin/pos/offline/devices/" + deviceId + "/revoke", {
    reason: "Repeat revocation is safe",
  });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).already_revoked, true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='pos.offline_device_revoked' AND entity_id=?").get(deviceId).count, 1);
});


test("real Worker fails closed and issues no permit while offline checkout is disabled", async () => {
  const identity = await createIdentity(), deviceId = randomUUID();
  const challengeResponse = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: deviceId, register_id: registerId,
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
  });
  const challenge = await challengeResponse.json();
  const enrolled = await api("/api/admin/pos/offline/devices/enroll",
    await enrollPayload(identity, challenge.challenge, challenge.challenge_id, deviceId));
  assert.equal(enrolled.status, 201);
  const response = await api("/api/admin/pos/offline/devices/" + deviceId + "/permits", {
    cashier_admin_id: ownerId, session_id: randomUUID(), duration_hours: 4,
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not enabled/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_permits WHERE device_id=?").get(deviceId).count, 0);
});


test("real Worker issues a signed permit bound to the enrolled device, register, cashier, open shift and exact reserved stock", async () => {
  const identity = await createIdentity(), deviceId = randomUUID(), sessionId = randomUUID();
  const productId = randomUUID(), variantId = randomUUID();
  const challengeResponse = await api("/api/admin/pos/offline/enrollment-challenges", {
    device_id: deviceId, register_id: registerId,
    public_key_jwk: identity.publicJwk, public_key_thumbprint: identity.thumbprint,
  });
  const challenge = await challengeResponse.json();
  const enrolled = await api("/api/admin/pos/offline/devices/enroll",
    await enrollPayload(identity, challenge.challenge, challenge.challenge_id, deviceId));
  assert.equal(enrolled.status, 201);

  sqlite.prepare("INSERT INTO admin_pos_cashiers (admin_user_id,granted_by_admin_id) VALUES (?,?)").run(ownerId, ownerId);
  sqlite.prepare("INSERT INTO pos_sessions (id,register_id,opened_by_admin_id,opening_cash_paisa,expected_cash_paisa,status) VALUES (?,?,?,0,0,'open')")
    .run(sessionId, registerId, ownerId);
  sqlite.prepare("INSERT INTO products (id,slug,name,description,category,audience,status,retail_price_paisa) VALUES (?,?,?,'','apparel','unisex','published',1250)")
    .run(productId, "integration-shirt-" + productId, "Integration Shirt");
  sqlite.prepare("INSERT INTO product_variants (id,product_id,sku,size,color,stock_on_hand,is_active,cost_price_paisa) VALUES (?,?,?,'M','Black',5,1,500)")
    .run(variantId, productId, "INT-" + variantId.slice(0, 8));

  const allocation = await api("/api/admin/pos/offline/devices/" + deviceId + "/allocations", {
    allocations: [{ variant_id: variantId, quantity: 2 }],
  });
  assert.equal(allocation.status, 201);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(variantId).reserved_quantity, 2);

  const signingPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", signingPair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", signingPair.publicKey);
  env.POS_OFFLINE_PERMIT_PRIVATE_JWK = JSON.stringify(privateJwk);
  env.POS_OFFLINE_PERMIT_PUBLIC_JWK = JSON.stringify(publicJwk);
  env.OFFLINE_POS_CHECKOUT_ENABLED = "true";

  const issued = await api("/api/admin/pos/offline/devices/" + deviceId + "/permits", {
    cashier_admin_id: ownerId, session_id: sessionId, duration_hours: 2,
  });
  assert.equal(issued.status, 201);
  const payload = await issued.json();
  const permit = payload.permit;
  assert.equal(permit.claims.device_id, deviceId);
  assert.equal(permit.claims.register_id, registerId);
  assert.equal(permit.claims.session_id, sessionId);
  assert.equal(permit.claims.cashier_admin_id, ownerId);
  assert.equal(permit.claims.cash_only, true);
  assert.equal(permit.claims.allow_refunds, false);
  assert.equal(permit.claims.allow_voids, false);
  assert.equal(permit.claims.allow_shift_close, false);
  assert.equal(permit.claims.allocations.length, 1);
  assert.deepEqual(permit.claims.allocations[0], {
    allocation_id: sqlite.prepare("SELECT id FROM pos_offline_stock_allocations WHERE device_id=?").get(deviceId).id,
    variant_id: variantId, quantity: 2, unit_price_paisa: 1250,
  });
  assert.equal(permit.snapshot.length, 1);
  assert.equal(permit.snapshot[0].variantId, variantId);
  assert.equal(permit.snapshot[0].allocatedQuantity, 2);
  assert.equal(Object.hasOwn(permit.snapshot[0], "costPricePaisa"), false);
  assert.equal(JSON.stringify(permit).includes("costPricePaisa"), false);
  assert.equal(await verifyOfflinePermitSignatureServer(permit.claims, permit.signature_base64url, publicJwk), true);
  const stored = sqlite.prepare("SELECT status,cost_snapshot_json FROM pos_offline_permits WHERE id=?").get(permit.id);
  assert.equal(stored.status, "active");
  assert.equal(JSON.parse(stored.cost_snapshot_json)[0].costPricePaisa, 500);
});
