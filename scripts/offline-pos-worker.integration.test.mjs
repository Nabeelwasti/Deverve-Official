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
  constructor(db) { this.db = db; this.failNextBatchAt = null; }
  prepare(sql) { return new LocalD1Statement(this.db, sql); }
  batch(statements) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (let index = 0; index < statements.length; index += 1) {
        if (this.failNextBatchAt === index) {
          this.failNextBatchAt = null;
          throw new Error("injected isolated D1 batch failure at statement " + index);
        }
        results.push(statements[index].run());
      }
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.failNextBatchAt = null;
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


function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite test value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const record = value;
    return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key])).join(",") + "}";
  }
  throw new Error("unsupported test value");
}
async function signSale(identity, sale) {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, identity.pair.privateKey,
    new TextEncoder().encode("deverve-offline-pos:event:v1\n" + canonicalJson(sale)),
  );
  return b64url(signature);
}

test("real Worker commits a signed cash sale atomically and returns the canonical receipt for exact duplicate replay", async () => {
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
    .run(productId, "integration-sale-" + productId, "Integration Sale Shirt");
  const sku = "SALE-" + variantId.slice(0, 8);
  sqlite.prepare("INSERT INTO product_variants (id,product_id,sku,size,color,stock_on_hand,is_active,cost_price_paisa) VALUES (?,?,?,'M','Black',5,1,500)")
    .run(variantId, productId, sku);
  const allocation = await api("/api/admin/pos/offline/devices/" + deviceId + "/allocations", {
    allocations: [{ variant_id: variantId, quantity: 2 }],
  });
  assert.equal(allocation.status, 201);

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
  const permit = (await issued.json()).permit;

  const sale = {
    eventId: randomUUID(), idempotencyKey: randomUUID(), deviceId, permitId: permit.id,
    registerId, sessionId, cashierId: ownerId, snapshotVersion: permit.claims.snapshot_version,
    createdAt: new Date().toISOString(), currency: "PKR",
    lines: [{ variantId, sku, productName: "Integration Sale Shirt", size: "M", color: "Black", quantity: 1, unitPricePaisa: 1250, lineTotalPaisa: 1250 }],
    subtotalPaisa: 1250, totalPaisa: 1250, cashTenderedPaisa: 1500, changePaisa: 250,
    sequence: 1, status: "pending", payloadVersion: 1,
  };
  const signature = await signSale(identity, sale);
  const syncPath = "/api/admin/pos/offline/sync";
  const requestBody = { device_id: deviceId, permit_id: permit.id, events: [{ event: sale, signature }] };
  const first = await api(syncPath, requestBody);
  assert.equal(first.status, 200);
  const firstResult = (await first.json()).results[0];
  assert.equal(firstResult.outcome, "accepted");
  assert.equal(firstResult.event_id, sale.eventId);
  assert.match(firstResult.canonical_sale_id, /^[a-f0-9-]{36}$/i);
  assert.ok(firstResult.receipt_number);

  const countsAfterFirst = {
    sales: sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count,
    items: sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sale_items").get().count,
    payments: sqlite.prepare("SELECT COUNT(*) AS count FROM pos_payments").get().count,
    ledger: sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions WHERE reference_type='pos_sale'").get().count,
    movements: sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='order' AND reference_id=?").get(firstResult.canonical_sale_id).count,
    events: sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events WHERE event_id=? AND outcome='accepted'").get(sale.eventId).count,
  };
  assert.deepEqual(countsAfterFirst, { sales: 1, items: 1, payments: 1, ledger: 1, movements: 1, events: 1 });
  assert.equal(sqlite.prepare("SELECT stock_on_hand FROM product_variants WHERE id=?").get(variantId).stock_on_hand, 4);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(variantId).reserved_quantity, 1);
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(deviceId).consumed_quantity, 1);

  const duplicate = await api(syncPath, requestBody);
  assert.equal(duplicate.status, 200);
  const duplicateResult = (await duplicate.json()).results[0];
  assert.equal(duplicateResult.outcome, "accepted");
  assert.equal(duplicateResult.duplicate, true);
  assert.equal(duplicateResult.canonical_sale_id, firstResult.canonical_sale_id);
  assert.equal(duplicateResult.receipt_number, firstResult.receipt_number);
  assert.deepEqual({
    sales: sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count,
    items: sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sale_items").get().count,
    payments: sqlite.prepare("SELECT COUNT(*) AS count FROM pos_payments").get().count,
    ledger: sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions WHERE reference_type='pos_sale'").get().count,
    movements: sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='order' AND reference_id=?").get(firstResult.canonical_sale_id).count,
  }, { sales: 1, items: 1, payments: 1, ledger: 1, movements: 1 });

  const alteredReplay = { ...sale, cashTenderedPaisa: 1600, changePaisa: 350 };
  const altered = await api(syncPath, { device_id: deviceId, permit_id: permit.id, events: [{ event: alteredReplay, signature: await signSale(identity, alteredReplay) }] });
  assert.equal(altered.status, 200);
  assert.equal((await altered.json()).results[0].outcome, "conflict");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='pos.offline_replay_conflict'").get().count, 1);
});


async function createReadyOfflinePermitFixture() {
  const identity = await createIdentity(), deviceId = randomUUID(), sessionId = randomUUID();
  const productId = randomUUID(), variantId = randomUUID(), sku = "ROLLBACK-" + variantId.slice(0, 8);
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
    .run(productId, "rollback-product-" + productId, "Rollback Test Shirt");
  sqlite.prepare("INSERT INTO product_variants (id,product_id,sku,size,color,stock_on_hand,is_active,cost_price_paisa) VALUES (?,?,?,'M','Black',5,1,500)")
    .run(variantId, productId, sku);
  const allocation = await api("/api/admin/pos/offline/devices/" + deviceId + "/allocations", {
    allocations: [{ variant_id: variantId, quantity: 2 }],
  });
  assert.equal(allocation.status, 201);
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
  const permit = (await issued.json()).permit;
  const sale = {
    eventId: randomUUID(), idempotencyKey: randomUUID(), deviceId, permitId: permit.id,
    registerId, sessionId, cashierId: ownerId, snapshotVersion: permit.claims.snapshot_version,
    createdAt: new Date().toISOString(), currency: "PKR",
    lines: [{ variantId, sku, productName: "Rollback Test Shirt", size: "M", color: "Black", quantity: 1, unitPricePaisa: 1250, lineTotalPaisa: 1250 }],
    subtotalPaisa: 1250, totalPaisa: 1250, cashTenderedPaisa: 1500, changePaisa: 250,
    sequence: 1, status: "pending", payloadVersion: 1,
  };
  return { identity, deviceId, variantId, permit, sale };
}

test("real Worker rolls back every signed-sale D1 batch statement failure boundary", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  // One sale line produces 19 ordered D1 statements (event, sale/guard,
  // item/stock/allocation/movement guards, payment, ledger, audit and outcome).
  // Fail each statement in turn. Each failed sale is preserved as a conflict
  // after the failed atomic batch has rolled back; the next sequence can proceed.
  for (let failAt = 0; failAt < 19; failAt += 1) {
    const sale = {
      ...fixture.sale,
      eventId: randomUUID(),
      idempotencyKey: randomUUID(),
      createdAt: new Date(Date.now() + failAt + 1).toISOString(),
      sequence: failAt + 1,
    };
    db.failNextBatchAt = failAt;
    const response = await api("/api/admin/pos/offline/sync", {
      device_id: fixture.deviceId,
      permit_id: fixture.permit.id,
      events: [{ event: sale, signature: await signSale(fixture.identity, sale) }],
    });
    assert.equal(response.status, 200, "failure boundary " + failAt + " returns a recoverable sync result");
    const result = (await response.json()).results[0];
    assert.equal(result.outcome, "conflict", "failure boundary " + failAt + " must not accept a partial sale");
    assert.equal(result.reason_code, "sale_commit_guard_failed", "failure boundary " + failAt + " is recorded for reconciliation");
    assert.equal(sqlite.prepare("SELECT outcome FROM pos_offline_events WHERE event_id=?").get(sale.eventId).outcome, "conflict");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_cases WHERE event_id=? AND status='open'").get(sale.eventId).count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sale_items").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_payments").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions WHERE reference_type='pos_sale'").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='order'").get().count, 0);
    assert.equal(sqlite.prepare("SELECT stock_on_hand,reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).stock_on_hand, 5);
    assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 2);
    assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 0);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events WHERE device_id=? AND outcome='conflict'").get(fixture.deviceId).count, 19);
});


test("real Worker rejects invalid device signatures and defers sequence gaps without consuming sequence state", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const attacker = await createIdentity();
  const forgedSale = { ...fixture.sale, eventId: randomUUID(), idempotencyKey: randomUUID() };
  const forged = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId, permit_id: fixture.permit.id,
    events: [{ event: forgedSale, signature: await signSale(attacker, forgedSale) }],
  });
  assert.equal(forged.status, 200);
  assert.equal((await forged.json()).results[0].reason_code, "device_signature_invalid");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events").get().count, 0);

  const gapSale = { ...fixture.sale, eventId: randomUUID(), idempotencyKey: randomUUID(), sequence: 2 };
  const gap = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId, permit_id: fixture.permit.id,
    events: [{ event: gapSale, signature: await signSale(fixture.identity, gapSale) }],
  });
  assert.equal(gap.status, 200);
  const gapResult = (await gap.json()).results[0];
  assert.equal(gapResult.outcome, "retry");
  assert.equal(gapResult.reason_code, "device_sequence_gap");
  assert.equal(gapResult.expected_sequence, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events").get().count, 0);
});

test("real Worker preserves a signed sale as a review conflict when its enrolled device is revoked", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const revoked = await api("/api/admin/pos/offline/devices/" + fixture.deviceId + "/revoke", {
    reason: "Device revoked before reconnecting its queued sale",
  });
  assert.equal(revoked.status, 200);
  const response = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId, permit_id: fixture.permit.id,
    events: [{ event: fixture.sale, signature: await signSale(fixture.identity, fixture.sale) }],
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).results[0];
  assert.equal(result.outcome, "conflict");
  assert.equal(result.reason_code, "device_revoked");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_cases WHERE event_id=? AND status='open'").get(fixture.sale.eventId).count, 1);
});


async function openRevokedDeviceConflict(fixture) {
  const revoked = await api("/api/admin/pos/offline/devices/" + fixture.deviceId + "/revoke", {
    reason: "Revoke device to force a controlled reconciliation case",
  });
  assert.equal(revoked.status, 200);
  const response = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId, permit_id: fixture.permit.id,
    events: [{ event: fixture.sale, signature: await signSale(fixture.identity, fixture.sale) }],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].outcome, "conflict");
  return sqlite.prepare("SELECT id FROM pos_offline_reconciliation_cases WHERE event_id=?").get(fixture.sale.eventId).id;
}

function insertCanonicalSaleForReconciliation(fixture, tendered = 1500, change = 250, overrides = {}) {
  const saleId = randomUUID();
  let variantId = overrides.variantId ?? fixture.variantId;
  if (overrides.useDifferentVariant) {
    const productId = randomUUID();
    variantId = randomUUID();
    sqlite.prepare("INSERT INTO products (id,slug,name,description,category,audience,status,retail_price_paisa) VALUES (?,?,?,'','apparel','unisex','published',1250)")
      .run(productId, "reconciliation-mismatch-" + productId, "Mismatch Variant");
    sqlite.prepare("INSERT INTO product_variants (id,product_id,sku,size,color,stock_on_hand,is_active,cost_price_paisa) VALUES (?,?,?,'L','Blue',5,1,500)")
      .run(variantId, productId, "MISMATCH-" + variantId.slice(0, 8));
  }
  const variant = sqlite.prepare("SELECT product_id,sku,size,color FROM product_variants WHERE id=?").get(variantId);
  const quantity = overrides.quantity ?? 1;
  const unitPrice = overrides.unitPricePaisa ?? 1250;
  const lineTotal = overrides.lineTotalPaisa ?? quantity * unitPrice;
  const subtotal = overrides.subtotalPaisa ?? 1250;
  const total = overrides.totalPaisa ?? 1250;
  const sessionId = overrides.sessionId ?? fixture.sale.sessionId;
  let cashierId = overrides.cashierAdminId ?? ownerId;
  if (overrides.useDifferentCashier) {
    cashierId = randomUUID();
    sqlite.prepare("INSERT INTO admin_users (id,email,password_hash,role) VALUES (?,?,?,'owner')")
      .run(cashierId, cashierId + "@integration.test", "test-only-not-used");
  }
  if (overrides.useDifferentShift) {
    const otherRegisterId = randomUUID();
    const otherSessionId = randomUUID();
    sqlite.prepare("INSERT INTO pos_registers (id,name,location_label,is_active) VALUES (?,?,?,1)")
      .run(otherRegisterId, "Mismatch register", "Isolated reconciliation mismatch");
    sqlite.prepare("INSERT INTO pos_sessions (id,register_id,opened_by_admin_id,opening_cash_paisa,expected_cash_paisa,status) VALUES (?,?,?,0,0,'open')")
      .run(otherSessionId, otherRegisterId, ownerId);
    overrides = { ...overrides, sessionId: otherSessionId };
  }
  const effectiveSessionId = overrides.sessionId ?? sessionId;
  // Keep enough fixture stock for deliberately mismatched quantities; this is
  // a synthetic canonical sale and must not fail before the reconciliation guard.
  if (quantity > 1) sqlite.prepare("UPDATE product_variants SET stock_on_hand=20 WHERE id=?").run(variantId);
  sqlite.prepare("UPDATE product_variants SET stock_on_hand=stock_on_hand-? WHERE id=?").run(quantity, variantId);
  sqlite.prepare("INSERT INTO pos_sales (id,receipt_number,session_id,customer_name,customer_phone,subtotal_paisa,discount_paisa,total_paisa,status,idempotency_key,cashier_admin_id) VALUES (?,?,?,'Walk-in customer','',?,0,?,'completed',?,?)")
    .run(saleId, "DV-RECON-" + saleId.slice(0, 8), effectiveSessionId, subtotal, total, randomUUID(), cashierId);
  sqlite.prepare("INSERT INTO pos_sale_items (id,sale_id,product_id,variant_id,product_name_snapshot,sku_snapshot,size_snapshot,color_snapshot,quantity,unit_price_paisa,unit_cost_paisa,line_total_paisa) VALUES (?,?,?,?,?,?,?,?,?,?,500,?)")
    .run(randomUUID(), saleId, variant.product_id, variantId, "Rollback Test Shirt", variant.sku, variant.size, variant.color, quantity, unitPrice, lineTotal);
  sqlite.prepare("INSERT INTO pos_payments (id,sale_id,account_id,payment_method,amount_paisa,tendered_paisa,change_paisa,reference) VALUES (?,?,'cash-main','cash',?,?,?, 'reconciliation fixture')")
    .run(randomUUID(), saleId, total, tendered, change);
  sqlite.prepare("INSERT INTO financial_transactions (id,account_id,direction,amount_paisa,category,reference_type,reference_id,register_session_id,note,actor_admin_id) VALUES (?,'cash-main','in',?,'pos_sale','pos_sale',?,?,?,?)")
    .run(randomUUID(), overrides.financialAmountPaisa ?? total, saleId, effectiveSessionId, "Reconciliation fixture", cashierId);
  sqlite.prepare("INSERT INTO inventory_movements (id,variant_id,movement_type,quantity_delta,reference_type,reference_id,note,actor_admin_id) VALUES (?,?,'sold',?,'order',?,?,?)")
    .run(randomUUID(), overrides.movementVariantId ?? variantId, overrides.movementQuantityDelta ?? -quantity, saleId, "Completed POS sale reconciliation fixture", cashierId);
  return saleId;
}

test("real Worker rolls back every conflict-evidence D1 batch statement failure boundary", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const revoked = await api("/api/admin/pos/offline/devices/" + fixture.deviceId + "/revoke", {
    reason: "Exercise atomic conflict evidence persistence",
  });
  assert.equal(revoked.status, 200);
  for (let failAt = 0; failAt < 4; failAt += 1) {
    const sale = {
      ...fixture.sale,
      eventId: randomUUID(),
      idempotencyKey: randomUUID(),
      createdAt: new Date(Date.now() + failAt + 1).toISOString(),
    };
    db.failNextBatchAt = failAt;
    const response = await api("/api/admin/pos/offline/sync", {
      device_id: fixture.deviceId,
      permit_id: fixture.permit.id,
      events: [{ event: sale, signature: await signSale(fixture.identity, sale) }],
    });
    assert.equal(response.status, 503, "conflict evidence failure boundary " + failAt + " must remain retryable");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events WHERE event_id=?").get(sale.eventId).count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_cases WHERE event_id=?").get(sale.eventId).count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='pos.offline_sale_conflict' AND entity_id=?").get(sale.eventId).count, 0);
  }
  const finalSale = {
    ...fixture.sale,
    eventId: randomUUID(),
    idempotencyKey: randomUUID(),
    createdAt: new Date(Date.now() + 10).toISOString(),
  };
  const recovered = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId,
    permit_id: fixture.permit.id,
    events: [{ event: finalSale, signature: await signSale(fixture.identity, finalSale) }],
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).results[0].outcome, "conflict");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events WHERE event_id=? AND outcome='conflict'").get(finalSale.eventId).count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_cases WHERE event_id=? AND status='open'").get(finalSale.eventId).count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_actions a JOIN pos_offline_reconciliation_cases c ON c.id=a.case_id WHERE c.event_id=? AND a.action_type='case_opened'").get(finalSale.eventId).count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='pos.offline_sale_conflict' AND entity_id=?").get(finalSale.eventId).count, 1);
});

test("real Worker resolves a conflict only against an exact completed sale and consumes its reserved allocation once", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture);
  const resolved = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId,
    reason: "Verified the completed POS receipt, cash drawer and stock movement",
  });
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).resolved, true);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "resolved");
  const event = sqlite.prepare("SELECT outcome,canonical_sale_id FROM pos_offline_events WHERE event_id=?").get(fixture.sale.eventId);
  assert.equal(event.outcome, "accepted");
  assert.equal(event.canonical_sale_id, canonicalSaleId);
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 1);
  assert.equal(sqlite.prepare("SELECT stock_on_hand,reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).stock_on_hand, 4);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 1);
  const repeated = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId,
    reason: "Repeated resolution must not consume the allocation twice",
  });
  assert.equal(repeated.status, 409);
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 1);
});

test("real Worker serializes concurrent reconciliation attempts and consumes one allocation exactly once", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture);
  const payload = {
    canonical_sale_id: canonicalSaleId,
    reason: "Concurrent duplicate reconciliation must resolve exactly once",
  };
  const [left, right] = await Promise.all([
    api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", payload),
    api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", payload),
  ]);
  const statuses = [left.status, right.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "resolved");
  assert.equal(sqlite.prepare("SELECT outcome,canonical_sale_id FROM pos_offline_events WHERE event_id=?").get(fixture.sale.eventId).outcome, "accepted");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_actions WHERE case_id=? AND action_type='accepted'").get(caseId).count, 1);
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 1);
  assert.equal(sqlite.prepare("SELECT stock_on_hand,reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).stock_on_hand, 4);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 1);
});

test("real Worker rolls back every reconciliation D1 statement failure boundary", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture);
  // One-line reconciliation has nine D1 statements: allocation/guard,
  // event/guard, case/guard, accepted-action/guard and audit evidence.
  for (let failAt = 0; failAt < 9; failAt += 1) {
    db.failNextBatchAt = failAt;
    const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
      canonical_sale_id: canonicalSaleId,
      reason: "Failure-injection boundary " + failAt + " must roll back atomically",
    });
    assert.equal(response.status, 409, "reconciliation failure boundary " + failAt + " must fail closed");
    assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
    assert.equal(sqlite.prepare("SELECT outcome,canonical_sale_id FROM pos_offline_events WHERE event_id=?").get(fixture.sale.eventId).outcome, "conflict");
    assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 0);
    assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_actions WHERE case_id=? AND action_type='accepted'").get(caseId).count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='pos.offline_reconciliation_resolved' AND entity_id=?").get(caseId).count, 0);
  }
  const recovered = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId,
    reason: "Resolve after every rollback boundary has been verified",
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).resolved, true);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "resolved");
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_actions WHERE case_id=? AND action_type='accepted'").get(caseId).count, 1);
});

test("real Worker rejects reconciliation when the completed sale cashier does not match the offline event", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 250, { useDifferentCashier: true });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched cashier identity is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 0);
});

test("real Worker rejects reconciliation when the completed sale shift does not match the offline event", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 250, { useDifferentShift: true });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched register shift is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker rejects reconciliation when completed sale totals do not match the offline event", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 250, { subtotalPaisa: 1249, totalPaisa: 1249 });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched sale totals are rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker rejects reconciliation when completed sale line variant does not match", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 250, { useDifferentVariant: true });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched sale variant is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker rejects reconciliation when completed sale line quantity does not match", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 2500, 1250, { quantity: 2, lineTotalPaisa: 2500 });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched sale quantity is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker rejects reconciliation when completed sale line price does not match", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 300, { unitPricePaisa: 1200, lineTotalPaisa: 1200 });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched sale unit price is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker rejects reconciliation when cash change does not match the offline event", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 249);
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched cash change is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker rejects reconciliation when cash financial ledger amount does not match", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 250, { financialAmountPaisa: 1249 });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched cash ledger amount is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker rejects reconciliation when inventory movement quantity does not match", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1500, 250, { movementQuantityDelta: -2 });
  const response = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId, reason: "Verify mismatched inventory movement is rejected",
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
});

test("real Worker leaves reconciliation open when the completed sale cash tender does not match the immutable offline event", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const caseId = await openRevokedDeviceConflict(fixture);
  const canonicalSaleId = insertCanonicalSaleForReconciliation(fixture, 1499, 249);
  const rejected = await api("/api/admin/pos/offline/reconciliation-cases/" + caseId + "/resolve", {
    canonical_sale_id: canonicalSaleId,
    reason: "Attempt reconciliation with intentionally incorrect cash tender evidence",
  });
  assert.equal(rejected.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM pos_offline_reconciliation_cases WHERE id=?").get(caseId).status, "open");
  assert.equal(sqlite.prepare("SELECT outcome,canonical_sale_id FROM pos_offline_events WHERE event_id=?").get(fixture.sale.eventId).outcome, "conflict");
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 0);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 2);
});


test("real Worker handles concurrent exact duplicate sync requests with one canonical sale and one stock consumption", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const signature = await signSale(fixture.identity, fixture.sale);
  const body = {
    device_id: fixture.deviceId, permit_id: fixture.permit.id,
    events: [{ event: fixture.sale, signature }],
  };
  const [left, right] = await Promise.all([
    api("/api/admin/pos/offline/sync", body),
    api("/api/admin/pos/offline/sync", body),
  ]);
  assert.equal(left.status, 200);
  assert.equal(right.status, 200);
  const leftResult = (await left.json()).results[0];
  const rightResult = (await right.json()).results[0];
  assert.equal(leftResult.outcome, "accepted");
  assert.equal(rightResult.outcome, "accepted");
  assert.equal(leftResult.canonical_sale_id, rightResult.canonical_sale_id);
  assert.equal(leftResult.receipt_number, rightResult.receipt_number);
  assert.equal([leftResult, rightResult].filter((result) => result.duplicate === true).length, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_payments").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions WHERE reference_type='pos_sale'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='order'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT stock_on_hand FROM product_variants WHERE id=?").get(fixture.variantId).stock_on_hand, 4);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 1);
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 1);
});


test("real Worker rejects a concurrent distinct event that races for an already-consumed device sequence", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const competingSale = {
    ...fixture.sale,
    eventId: randomUUID(),
    idempotencyKey: randomUUID(),
    createdAt: new Date(Date.now() + 1).toISOString(),
  };
  const [firstResponse, competingResponse] = await Promise.all([
    api("/api/admin/pos/offline/sync", {
      device_id: fixture.deviceId, permit_id: fixture.permit.id,
      events: [{ event: fixture.sale, signature: await signSale(fixture.identity, fixture.sale) }],
    }),
    api("/api/admin/pos/offline/sync", {
      device_id: fixture.deviceId, permit_id: fixture.permit.id,
      events: [{ event: competingSale, signature: await signSale(fixture.identity, competingSale) }],
    }),
  ]);
  assert.equal(firstResponse.status, 200);
  assert.equal(competingResponse.status, 200);
  const results = [(await firstResponse.json()).results[0], (await competingResponse.json()).results[0]];
  assert.equal(results.filter((result) => result.outcome === "accepted").length, 1);
  assert.equal(results.filter((result) => result.outcome === "conflict").length, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events WHERE device_id=? AND device_sequence=1").get(fixture.deviceId).count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_payments").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions WHERE reference_type='pos_sale'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='order'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT stock_on_hand FROM product_variants WHERE id=?").get(fixture.variantId).stock_on_hand, 4);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 1);
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 1);
});

test("real Worker processes a multi-event offline batch in strict sequence with balanced stock and cash ledgers", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const secondSale = {
    ...fixture.sale,
    eventId: randomUUID(),
    idempotencyKey: randomUUID(),
    createdAt: new Date(Date.now() + 1).toISOString(),
    sequence: 2,
  };
  const response = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId,
    permit_id: fixture.permit.id,
    events: [
      { event: fixture.sale, signature: await signSale(fixture.identity, fixture.sale) },
      { event: secondSale, signature: await signSale(fixture.identity, secondSale) },
    ],
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.complete, true);
  assert.deepEqual(payload.results.map((result) => result.outcome), ["accepted", "accepted"]);
  assert.equal(payload.results[0].event_id, fixture.sale.eventId);
  assert.equal(payload.results[1].event_id, secondSale.eventId);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sale_items").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_payments").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions WHERE reference_type='pos_sale'").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='order'").get().count, 2);
  assert.equal(sqlite.prepare("SELECT stock_on_hand FROM product_variants WHERE id=?").get(fixture.variantId).stock_on_hand, 3);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 0);
  assert.equal(sqlite.prepare("SELECT consumed_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).consumed_quantity, 2);
});


test("real Worker rejects a permit signed by a different configured verification key", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const attacker = await createIdentity();
  env.POS_OFFLINE_PERMIT_PUBLIC_JWK = JSON.stringify(attacker.publicJwk);
  const response = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId, permit_id: fixture.permit.id,
    events: [{ event: fixture.sale, signature: await signSale(fixture.identity, fixture.sale) }],
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).results[0];
  assert.equal(result.outcome, "rejected");
  assert.equal(result.reason_code, "permit_signature_invalid");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_events").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_sales").get().count, 0);
});

test("real Worker blocks permit replacement while an unresolved signed sale conflict exists", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  const alteredSale = {
    ...fixture.sale,
    lines: [{ ...fixture.sale.lines[0], unitPricePaisa: 1300, lineTotalPaisa: 1300 }],
    subtotalPaisa: 1300,
    totalPaisa: 1300,
    cashTenderedPaisa: 1500,
    changePaisa: 200,
  };
  const conflict = await api("/api/admin/pos/offline/sync", {
    device_id: fixture.deviceId, permit_id: fixture.permit.id,
    events: [{ event: alteredSale, signature: await signSale(fixture.identity, alteredSale) }],
  });
  assert.equal(conflict.status, 200);
  assert.equal((await conflict.json()).results[0].outcome, "conflict");
  sqlite.prepare("UPDATE pos_offline_permits SET status='expired' WHERE id=?").run(fixture.permit.id);
  const replacement = await api("/api/admin/pos/offline/devices/" + fixture.deviceId + "/permits", {
    cashier_admin_id: ownerId, session_id: fixture.sale.sessionId, duration_hours: 2,
  });
  assert.equal(replacement.status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_permits WHERE device_id=?").get(fixture.deviceId).count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pos_offline_reconciliation_cases WHERE event_id=? AND status='open'").get(alteredSale.eventId).count, 1);
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 2);
});

test("real Worker refuses to release reserved stock while a revoked device still has an unresolved offline conflict", async () => {
  const fixture = await createReadyOfflinePermitFixture();
  await openRevokedDeviceConflict(fixture);
  const response = await api("/api/admin/pos/offline/devices/" + fixture.deviceId + "/release-allocations", {
    reason: "Attempted release before queue reconciliation",
    owner_confirms_device_queue_reconciled: true,
  });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT status,allocated_quantity,released_quantity FROM pos_offline_stock_allocations WHERE device_id=?").get(fixture.deviceId).status, "active");
  assert.equal(sqlite.prepare("SELECT reserved_quantity FROM product_variants WHERE id=?").get(fixture.variantId).reserved_quantity, 2);
});
