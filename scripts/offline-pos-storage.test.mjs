import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/posOffline/storage.ts", import.meta.url), "utf8");
const design = readFileSync(new URL("../docs/OFFLINE-POS-RESEARCH-REVIEW.md", import.meta.url), "utf8");

assert.match(source, /indexedDB\.open\(OFFLINE_POS_DB_NAME, OFFLINE_POS_DB_VERSION\)/);
assert.match(source, /database\.transaction\(\["meta", "sales", "outbox", "audit"\], "readwrite"/);
assert.match(source, /durability: "strict"/);
assert.match(source, /transaction\.objectStore\("sales"\)\.add\(queued\)/);
assert.match(source, /transaction\.objectStore\("outbox"\)\.add\(/);
assert.match(source, /createIndex\("idempotencyKey", "idempotencyKey", \{ unique: true \}\)/);
assert.match(source, /createIndex\("sequence", "sequence", \{ unique: true \}\)/);
assert.match(source, /allowedDraftKeys/);
assert.match(source, /allowedLineKeys/);
assert.match(source, /quotaInspected/);
assert.match(source, /Browser storage quota information is unavailable/);
assert.match(source, /meta\.put\(\{ id: "device-sequence", value: sequence \}\)/);
assert.match(source, /persistentStorageGranted && databaseWritable/);
assert.match(source, /navigator\.storage\.persist\(\)/);
assert.match(source, /navigator\.storage\?\.estimate\(\)/);
assert.match(source, /Less than 5 MiB/);
assert.match(source, /draft\.cashTenderedPaisa < draft\.totalPaisa/);
assert.match(source, /draft\.totalPaisa !== draft\.subtotalPaisa/);
assert.match(design, /RAM.*temporary working memory/s);
assert.match(design, /Background Sync is optional acceleration only/);
assert.match(design, /Never fall back to RAM or localStorage/);
assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);

console.log("Emergency offline POS storage guardrails passed.");

const crypto = readFileSync(new URL("../src/posOffline/deviceCrypto.ts", import.meta.url), "utf8");
assert.match(crypto, /generateKey\([\s\S]*?false,[\s\S]*?\["sign", "verify"\]/);
assert.match(crypto, /privateKey: pair\.privateKey/);
assert.match(crypto, /objectStore\("device"\)\.add\(record\)/);
assert.match(crypto, /ECDSA.*P-256|namedCurve: "P-256"/);
assert.match(crypto, /SIGNING_CONTEXT \+ canonicalize\(payload\)/);
assert.match(crypto, /subtle\.sign\([\s\S]*?hash: "SHA-256"/);
assert.match(crypto, /publicKeyThumbprint/);
assert.match(crypto, /same-origin script compromise/);
assert.doesNotMatch(crypto, /localStorage|sessionStorage|document\.cookie/);

console.log("Offline POS device-identity and signing guardrails passed.");

assert.match(crypto, /validateStoredIdentity/);
assert.match(crypto, /extractable !== false/);
assert.match(crypto, /privateAlgorithm\.namedCurve !== "P-256"/);
assert.match(crypto, /calculatedThumbprint !== identity\.publicKeyThumbprint/);
