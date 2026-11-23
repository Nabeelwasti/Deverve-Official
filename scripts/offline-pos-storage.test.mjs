import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/posOffline/storage.ts", import.meta.url), "utf8");
const design = readFileSync(new URL("../docs/OFFLINE-POS-RESEARCH-REVIEW.md", import.meta.url), "utf8");

assert.match(source, /indexedDB\.open\(OFFLINE_POS_DB_NAME, OFFLINE_POS_DB_VERSION\)/);
assert.match(source, /database\.transaction\(\["meta", "sales", "outbox", "audit"\], "readwrite"/);
assert.match(source, /durability: "strict"/);
assert.match(source, /transaction\.objectStore\("sales"\)\.add\(queued\)/);
assert.match(source, /transaction\.objectStore\("outbox"\)\.add\(/);
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
