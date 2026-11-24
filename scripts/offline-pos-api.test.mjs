import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0046_pos_offline_enrollment_challenges.sql", import.meta.url), "utf8");
const crypto = readFileSync(new URL("../src/posOffline/deviceCrypto.ts", import.meta.url), "utf8");

assert.match(worker, /const offlineRoot = "\/api\/admin\/pos\/offline"/);
assert.match(worker, /signed offline sale sync/);
assert.match(worker, /isCashier && request\.method === "POST" && path === offlineRoot \+ "\/sync"/);
assert.match(worker, /admin\.admin_user_id !== permit\.cashier_admin_id/);
assert.match(worker, /authenticated_cashier_mismatch/);
assert.match(worker, /request\.method === "POST" && path === offlineRoot \+ "\/sync"/);
assert.match(worker, /Only an owner or manager can administer emergency offline POS devices/);
assert.match(worker, /pos_offline_enrollment_challenges/);
assert.match(worker, /deverve-offline-pos:enroll:v1\\n/);
assert.match(worker, /export async function verifyOfflineEnrollmentProof/);
assert.ok(worker.includes("subtle.importKey(") && worker.includes("namedCurve: \"P-256\""));
assert.ok(worker.includes("verifyOfflineEnrollmentProof(publicKey.jwk, challenge, signature)"));
assert.ok(worker.includes("crypto.subtle.verify(") && worker.includes("hash: \"SHA-256\""));
assert.match(worker, /\[A-Za-z0-9_-\]\{86\}/);
assert.match(worker, /Too many pending enrollment attempts/);
assert.match(worker, /DELETE FROM pos_offline_enrollment_challenges WHERE expires_at/);
assert.match(worker, /UPDATE pos_offline_enrollment_challenges SET consumed_at=/);
assert.match(worker, /consumed_at IS NULL AND expires_at>\?/);
assert.match(worker, /INSERT INTO pos_offline_devices[\s\S]*?WHERE changes\(\)=1/);
assert.match(worker, /pos\.offline_device_enrolled/);
assert.match(worker, /pos\.offline_device_revoked/);
assert.match(worker, /pos\.offline_stock_allocated/);
assert.match(worker, /async function issueOfflinePermit/);
assert.match(worker, /POS_OFFLINE_PERMIT_PRIVATE_JWK/);
assert.match(worker, /POS_OFFLINE_PERMIT_PUBLIC_JWK/);
assert.match(worker, /cash_only: true/);
assert.match(worker, /allow_refunds: false/);
assert.match(worker, /allow_voids: false/);
assert.match(worker, /allow_shift_close: false/);
assert.match(worker, /max_events: 20/);
assert.match(worker, /Offline permit signing is not configured/);
assert.ok(worker.includes("offlineRoot + \"/verification-key\""));
assert.match(worker, /snapshotHash = await sha256Hex\(canonicalOfflineJson\(snapshot\)\)/);

assert.ok(worker.includes("pos.offline_permit_issued"));

assert.match(worker, /Stock allocation failed\. The database rolled back the allocation batch/);
assert.match(worker, /owner_confirms_device_queue_reconciled !== true/);
assert.match(worker, /deviceState\.status !== "revoked"/);
assert.match(worker, /Resolve every pending or conflicted offline sale/);

assert.match(migration, /challenge_hash TEXT NOT NULL CHECK \(length\(challenge_hash\) = 43\)/);
assert.doesNotMatch(migration, /pos_offline_enrollment_challenge_no_delete/);
assert.match(migration, /pos_offline_enrollment_challenge_update_guard/);
assert.match(migration, /OLD\.consumed_at IS NOT NULL/);
assert.match(migration, /NEW\.consumed_at IS NULL/);
const permitMigration = readFileSync(new URL("../migrations/0047_pos_offline_permit_guards.sql", import.meta.url), "utf8");
assert.match(permitMigration, /pos_offline_permit_authorization_guard/);
assert.match(permitMigration, /pos_offline_allocation_insert_guard_during_permit/);
assert.match(permitMigration, /pos_offline_allocation_release_guard_during_permit/);
assert.match(permitMigration, /pos_offline_permit_identity_immutable/);
assert.ok(permitMigration.includes("json_each(json_extract(NEW.claims_json, '$.allocations'))"));


assert.match(crypto, /export async function signOfflineEnrollmentChallenge/);
assert.match(crypto, /deverve-offline-pos:enroll:v1\\n/);
assert.match(crypto, /validateStoredIdentity\(identity\)/);

assert.match(crypto, /export async function verifyOfflinePermitSignature/);
assert.match(crypto, /export async function verifyOfflinePermitSnapshot/);

assert.match(crypto, /deverve-offline-pos:permit:v1\\n/);

console.log("Offline POS server enrollment, revocation and allocation guardrails passed.");
