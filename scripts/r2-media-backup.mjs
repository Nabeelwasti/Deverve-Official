import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const API = "https://api.cloudflare.com/client/v4";
const sourceBucket = process.env.R2_MEDIA_SOURCE_BUCKET || "deverve-media-private";
const backupBucket = process.env.R2_MEDIA_BACKUP_BUCKET || "deverve-db-backups";
const keyHex = process.env.D1_BACKUP_ENCRYPTION_KEY || "";
const keyId = (process.env.D1_BACKUP_KEY_ID || "deverve-d1-key-v1") + "/hkdf-r2-media-v1";
const MAX_OBJECTS = 500;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_OBJECT_BYTES = 100 * 1024 * 1024;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export function isBackupEligibleMediaObject(object) {
  return typeof object?.key === "string" && !object.key.startsWith("rental-private/");
}
export function deriveMediaKey(hex) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("D1_BACKUP_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.");
  return Buffer.from(hkdfSync("sha256", Buffer.from(hex, "hex"), Buffer.from("deverve-r2-media-backup-v1"), Buffer.from("DVMEDIA1 AES-256-GCM"), 32));
}
export function encryptMedia(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from("DVMEDIA1", "ascii"), iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptMedia(archive, key) {
  if (archive.length < 36 || archive.subarray(0, 8).toString("ascii") !== "DVMEDIA1") throw new Error("Invalid encrypted media archive header.");
  const decipher = createDecipheriv("aes-256-gcm", key, archive.subarray(8, 20));
  decipher.setAuthTag(archive.subarray(20, 36));
  return Buffer.concat([decipher.update(archive.subarray(36)), decipher.final()]);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
function required(value, name) {
  if (!value) throw new Error("Missing required GitHub Actions secret/environment value: " + name);
  return value;
}
function encodedKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}
async function api(method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const message = payload.errors?.map((item) => item.message).filter(Boolean).join("; ");
    throw new Error("Cloudflare API " + method + " failed (" + response.status + "): " + (message || "request unsuccessful"));
  }
  return payload.result;
}
async function getObject(bucket, key) {
  const response = await fetch(API + "/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodedKey(key), {
    headers: { Authorization: "Bearer " + token },
    cache: "no-store",
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error("R2 object read failed for a media object (" + response.status + ").");
  return { bytes: Buffer.from(await response.arrayBuffer()), etag: response.headers.get("etag")?.replaceAll('"', "") || null };
}
async function putObject(bucket, key, bytes, contentType) {
  const response = await fetch(API + "/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodedKey(key), {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": contentType || "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(120000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error("Encrypted media backup upload failed (" + response.status + ").");
}
async function listObjects() {
  const objects = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(API + "/accounts/" + accountId + "/r2/buckets/" + sourceBucket + "/objects?" + query.toString(), {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      signal: AbortSignal.timeout(120000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
      const message = payload.errors?.map((item) => item.message).filter(Boolean).join("; ");
      throw new Error("R2 media inventory request failed (" + response.status + "): " + (message || "request unsuccessful"));
    }
    if (!Array.isArray(payload.result)) throw new Error("R2 media inventory response was not an object list.");
    objects.push(...payload.result);
    if (objects.length > MAX_OBJECTS) throw new Error("R2 media inventory exceeds the configured safe object-count limit.");
    cursor = payload.result_info?.cursor;
    if (!payload.result_info?.is_truncated || !cursor) return objects.filter(isBackupEligibleMediaObject).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }
  throw new Error("R2 media inventory pagination exceeded the configured safety limit.");
}
async function main() {
  required(accountId, "CLOUDFLARE_ACCOUNT_ID");
  required(token, "CLOUDFLARE_API_TOKEN");
  const key = deriveMediaKey(keyHex);
  const objects = await listObjects();
  if (objects.length === 0) throw new Error("Refusing to publish an empty R2 media backup.");
  const fingerprint = (items) => JSON.stringify(items.map((item) => ({
    key: item.key, size: item.size, etag: item.etag || null, last_modified: item.last_modified || null,
    http_metadata: item.http_metadata || {}, custom_metadata: item.custom_metadata || {}
  })));
  const sourceFingerprint = fingerprint(objects);
  const totalBytes = objects.reduce((sum, object) => sum + Number(object.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("R2 media inventory exceeds the configured 512 MiB safety limit.");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const manifestKey = "media-manifests/deverve-media-" + stamp + ".dvmanifest";
  const records = [];
  let verifiedBytes = 0;

  for (let index = 0; index < objects.length; index++) {
    const source = objects[index];
    const sourceKey = String(source.key || "");
    const expectedSize = Number(source.size);
    if (!sourceKey || !Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_OBJECT_BYTES) {
      throw new Error("R2 media inventory contains an invalid key or an object larger than 100 MiB.");
    }
    const downloaded = await getObject(sourceBucket, sourceKey);
    if (downloaded.bytes.length !== expectedSize) throw new Error("R2 media object size changed during backup; refusing an inconsistent snapshot.");
    if (source.etag && downloaded.etag && source.etag.replaceAll('"', "") !== downloaded.etag) {
      throw new Error("R2 media object changed during backup; retry after uploads have settled.");
    }
    const plaintextHash = sha256(downloaded.bytes);
    const archive = encryptMedia(downloaded.bytes, key);
    const backupKey = "media/encrypted/" + stamp + "/" + String(index).padStart(5, "0") + ".dvmedia";
    await putObject(backupBucket, backupKey, archive, "application/octet-stream");

    const readback = await getObject(backupBucket, backupKey);
    if (readback.bytes.length !== archive.length || sha256(readback.bytes) !== sha256(archive)) {
      throw new Error("Encrypted media R2 read-back checksum failed.");
    }
    const restored = decryptMedia(readback.bytes, key);
    if (restored.length !== expectedSize || sha256(restored) !== plaintextHash) {
      throw new Error("Encrypted media backup decryption or plaintext checksum verification failed.");
    }
    verifiedBytes += restored.length;
    records.push({
      source_key: sourceKey,
      source_etag: source.etag || null,
      source_size: expectedSize,
      source_sha256: plaintextHash,
      content_type: source.http_metadata?.contentType || "application/octet-stream",
      custom_metadata: source.custom_metadata || {},
      backup_object: backupKey,
      backup_bytes: archive.length,
      ciphertext_sha256: sha256(readback.bytes),
      verified: true
    });
    console.log("Verified encrypted media object", index + 1, "of", objects.length);
  }

  const finalInventory = await listObjects();
  if (fingerprint(finalInventory) !== sourceFingerprint) {
    throw new Error("R2 media inventory changed during backup; the snapshot is inconsistent and must be retried.");
  }

  const manifest = {
    format: "deverve-r2-media-backup-v1",
    created_at: new Date().toISOString(),
    source_bucket: sourceBucket,
    backup_bucket: backupBucket,
    encrypted: true,
    algorithm: "AES-256-GCM",
    key_derivation: "HKDF-SHA256",
    key_id: keyId,
    object_count: records.length,
    plaintext_bytes: verifiedBytes,
    all_objects_readback_and_decryption_verified: records.every((record) => record.verified),
    source_commit: process.env.D1_BACKUP_SOURCE_COMMIT || process.env.GITHUB_SHA || null,
    objects: records
  };
  // Object keys and custom metadata can reveal private rental/document relationships.
  // Encrypt the manifest as well as each media payload; never leave a plaintext inventory in R2.
  const encryptedManifest = encryptMedia(Buffer.from(JSON.stringify(manifest)), key);
  await putObject(backupBucket, manifestKey, encryptedManifest, "application/octet-stream");
  const manifestReadback = await getObject(backupBucket, manifestKey);
  if (sha256(manifestReadback.bytes) !== sha256(encryptedManifest)) {
    throw new Error("Encrypted media manifest R2 read-back checksum failed.");
  }
  const parsed = JSON.parse(decryptMedia(manifestReadback.bytes, key).toString("utf8"));
  if (
    parsed.format !== manifest.format ||
    parsed.object_count !== records.length ||
    parsed.objects?.length !== records.length ||
    parsed.all_objects_readback_and_decryption_verified !== true ||
    parsed.objects.some((record) => record.verified !== true)
  ) {
    throw new Error("Encrypted media backup manifest read-back verification failed.");
  }
  console.log(JSON.stringify({
    backup: "encrypted_media_snapshot_verified",
    source_bucket: sourceBucket,
    backup_bucket: backupBucket,
    manifest_object: manifestKey,
    object_count: records.length,
    plaintext_bytes: verifiedBytes,
    encryption: "AES-256-GCM/HKDF-SHA256",
    all_objects_readback_and_decryption_verified: true
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Encrypted R2 media backup failed.");
    process.exitCode = 1;
  });
}
