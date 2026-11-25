import test from "node:test";
import assert from "node:assert/strict";
import { deriveMediaKey, encryptMedia, decryptMedia, isBackupEligibleMediaObject } from "./r2-media-backup.mjs";

const fixtureKey = "a".repeat(64);

test("media backup derives a stable key in a separate domain from the D1 key", () => {
  const first = deriveMediaKey(fixtureKey);
  const second = deriveMediaKey(fixtureKey);
  assert.equal(first.length, 32);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, Buffer.from(fixtureKey, "hex"));
});

test("media archive encrypts and restores binary content exactly", () => {
  const key = deriveMediaKey(fixtureKey);
  const original = Buffer.from([0, 1, 2, 3, 255, 254, 128, 65]);
  const encrypted = encryptMedia(original, key);
  assert.equal(encrypted.subarray(0, 8).toString("ascii"), "DVMEDIA1");
  assert.notDeepEqual(encrypted, original);
  assert.deepEqual(decryptMedia(encrypted, key), original);
});

test("media archive uses a fresh nonce for each encryption", () => {
  const key = deriveMediaKey(fixtureKey);
  const original = Buffer.from("same media payload");
  assert.notDeepEqual(encryptMedia(original, key), encryptMedia(original, key));
});

test("tampered media archive is rejected by AES-GCM authentication", () => {
  const key = deriveMediaKey(fixtureKey);
  const encrypted = encryptMedia(Buffer.from("private document"), key);
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decryptMedia(encrypted, key));
});

test("invalid key material and archive headers are rejected", () => {
  assert.throws(() => deriveMediaKey("not-a-key"));
  assert.throws(() => decryptMedia(Buffer.from("not-an-archive"), deriveMediaKey(fixtureKey)));
});


test("private media inventory manifests are opaque until authenticated decryption", () => {
  const key = deriveMediaKey(fixtureKey);
  const manifest = JSON.stringify({
    source_bucket: "deverve-media-private",
    objects: [{ source_key: "rental-private/request-id/cnic_front.jpg", custom_metadata: { document: "private" } }],
  });
  const encrypted = encryptMedia(Buffer.from(manifest), key);
  assert.equal(encrypted.subarray(0, 8).toString("ascii"), "DVMEDIA1");
  assert.equal(encrypted.includes(Buffer.from("rental-private")), false);
  assert.equal(encrypted.includes(Buffer.from("cnic_front")), false);
  assert.equal(decryptMedia(encrypted, key).toString("utf8"), manifest);
});

test("routine media backups exclude private rental CNIC evidence", () => {
  assert.equal(isBackupEligibleMediaObject({key:"catalogue/hoodie.jpg"}), true);
  assert.equal(isBackupEligibleMediaObject({key:"rental-private/request-id/cnic_front.jpg"}), false);
  assert.equal(isBackupEligibleMediaObject({key:"rental-private/request-id/cnic_back.webp"}), false);
  assert.equal(isBackupEligibleMediaObject({key:""}), false);
});
