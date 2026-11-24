import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0046_pos_offline_enrollment_challenges.sql", import.meta.url), "utf8");
const crypto = readFileSync(new URL("../src/posOffline/deviceCrypto.ts", import.meta.url), "utf8");

assert.match(worker, /const offlineRoot = "\/api\/admin\/pos\/offline"/);
assert.match(worker, /Only an owner or manager can administer emergency offline POS devices/);
assert.match(worker, /pos_offline_enrollment_challenges/);
assert.match(worker, /deverve-offline-pos:enroll:v1\\n/);
assert.match(worker, /subtle\.importKey\("jwk", publicKey\.jwk, \{ name: "ECDSA", namedCurve: "P-256" \}/);
assert.match(worker, /subtle\.verify\(\{ name: "ECDSA", hash: "SHA-256" \}/);
assert.match(worker, /signatureBytes\.byteLength !== 64/);
assert.match(worker, /\[A-Za-z0-9_-\]\{86\}/);
assert.match(worker, /Too many pending enrollment attempts/);
assert.match(worker, /DELETE FROM pos_offline_enrollment_challenges WHERE expires_at/);
assert.match(worker, /UPDATE pos_offline_enrollment_challenges SET consumed_at=/);
assert.match(worker, /consumed_at IS NULL AND expires_at>\?/);
assert.match(worker, /INSERT INTO pos_offline_devices[\s\S]*?WHERE changes\(\)=1/);
assert.match(worker, /pos\.offline_device_enrolled/);
assert.match(worker, /pos\.offline_device_revoked/);
assert.match(worker, /pos\.offline_stock_allocated/);
assert.match(worker, /stock allocation failed\. The database rolled back the allocation batch/);
assert.match(worker, /owner_confirms_device_queue_reconciled !== true/);
assert.match(worker, /deviceState\.status !== "revoked"/);
assert.match(worker, /Resolve every pending or conflicted offline sale/);

assert.match(migration, /challenge_hash TEXT NOT NULL CHECK \(length\(challenge_hash\) = 43\)/);
assert.doesNotMatch(migration, /pos_offline_enrollment_challenge_no_delete/);
assert.match(migration, /pos_offline_enrollment_challenge_update_guard/);
assert.match(migration, /OLD\.consumed_at IS NOT NULL/);
assert.match(migration, /NEW\.consumed_at IS NULL/);

assert.match(crypto, /export async function signOfflineEnrollmentChallenge/);
assert.match(crypto, /deverve-offline-pos:enroll:v1\\n/);
assert.match(crypto, /validateStoredIdentity\(identity\)/);

console.log("Offline POS server enrollment, revocation and allocation guardrails passed.");
