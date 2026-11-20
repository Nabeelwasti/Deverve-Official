const FORMAT = "DEVERVE-CNIC-BACKUP";
const VERSION = 1;
const ITERATIONS = 310000;
const AAD = new TextEncoder().encode("De VERVE permanent evidence backup v1");
const MAX_FILE_BYTES = 8 * 1024 * 1024;
// Two maximum-size 8 MiB source images are JSON/base64 encoded, then the ciphertext is base64 encoded again.
// 32 MiB leaves safe room for both encoding layers and the envelope metadata.
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

export type EvidenceFile = { name: string; type: string; size: number; data: string };
export type EvidencePayload = { format: typeof FORMAT; version: number; referenceCode: string; createdAt: string; files: EvidenceFile[] };
type EncryptedEnvelope = { format: typeof FORMAT; version: number; cipher: "AES-256-GCM"; kdf: "PBKDF2-SHA-256"; iterations: number; salt: string; iv: string; ciphertext: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > MAX_ARCHIVE_BYTES * 2) throw new Error("The backup file contains invalid or oversized encoded data.");
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function hasImageSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0,4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8,12)) === "WEBP";
  return false;
}
function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "rental-evidence";
}

export async function createEncryptedEvidenceBackup(referenceCode: string, files: Array<{ name: string; blob: Blob }>, password: string): Promise<Blob> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure browser encryption is unavailable. Use the official HTTPS website in an updated browser.");
  if (password.length < 12) throw new Error("Use a backup password with at least 12 characters.");
  if (!files.length || files.length > 2) throw new Error("A backup must contain one or two CNIC image files.");
  let totalBytes = 0;
  const encryptedFiles: EvidenceFile[] = [];
  for (const file of files) {
    if (!["image/jpeg","image/png","image/webp"].includes(file.blob.type)) throw new Error("Only JPEG, PNG and WebP CNIC images can be backed up.");
    if (file.blob.size < 1 || file.blob.size > MAX_FILE_BYTES) throw new Error("A CNIC image exceeds the 8 MB backup safety limit.");
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    if (!hasImageSignature(file.blob.type, bytes)) throw new Error("A CNIC image did not pass its file-signature check.");
    totalBytes += file.blob.size;
    encryptedFiles.push({ name: safeName(file.name), type: file.blob.type, size: file.blob.size, data: toBase64(bytes) });
  }
  if (totalBytes > 2 * MAX_FILE_BYTES) throw new Error("The evidence backup exceeds the allowed 16 MB combined size.");
  const payload: EvidencePayload = { format: FORMAT, version: VERSION, referenceCode: safeName(referenceCode), createdAt: new Date().toISOString(), files: encryptedFiles };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD, tagLength: 128 }, key, plaintext);
  const envelope: EncryptedEnvelope = { format: FORMAT, version: VERSION, cipher: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
  return new Blob([JSON.stringify(envelope)], { type: "application/vnd.deverve.encrypted-evidence+json" });
}

export async function decryptEvidenceBackup(file: File, password: string): Promise<EvidencePayload> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure browser decryption is unavailable. Use the official HTTPS website in an updated browser.");
  if (file.size < 100 || file.size > MAX_ARCHIVE_BYTES) throw new Error("The backup file is empty or exceeds the 24 MB safety limit.");
  let envelope: EncryptedEnvelope;
  try { envelope = JSON.parse(await file.text()) as EncryptedEnvelope; } catch { throw new Error("This is not a readable De VERVE encrypted backup file."); }
  if (envelope.format !== FORMAT || envelope.version !== VERSION || envelope.cipher !== "AES-256-GCM" || envelope.kdf !== "PBKDF2-SHA-256" || envelope.iterations !== ITERATIONS) throw new Error("This backup format or encryption version is not supported.");
  const salt = fromBase64(envelope.salt), iv = fromBase64(envelope.iv), ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17 || ciphertext.length > MAX_ARCHIVE_BYTES) throw new Error("The backup integrity metadata is invalid.");
  let plaintext: ArrayBuffer;
  try { plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: AAD, tagLength: 128 }, await deriveKey(password, salt), ciphertext); }
  catch { throw new Error("Backup password is incorrect or the encrypted file has been changed or damaged."); }
  let payload: EvidencePayload;
  try { payload = JSON.parse(new TextDecoder().decode(plaintext)) as EvidencePayload; } catch { throw new Error("The decrypted backup content is invalid."); }
  if (payload.format !== FORMAT || payload.version !== VERSION || !Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > 2 || typeof payload.referenceCode !== "string") throw new Error("The backup manifest is incomplete or invalid.");
  let total = 0;
  for (const entry of payload.files) {
    if (!entry || typeof entry.name !== "string" || !["image/jpeg","image/png","image/webp"].includes(entry.type) || typeof entry.data !== "string") throw new Error("The backup contains an unsupported file entry.");
    const bytes = fromBase64(entry.data);
    if (bytes.length !== entry.size || bytes.length < 1 || bytes.length > MAX_FILE_BYTES || !hasImageSignature(entry.type, bytes)) throw new Error("A restored image failed its size or file-signature integrity check.");
    total += bytes.length;
  }
  if (total > 2 * MAX_FILE_BYTES) throw new Error("The restored backup exceeds the allowed size.");
  return payload;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStored(files: Array<{path:string;bytes:Uint8Array}>): Uint8Array {
  const encoder=new TextEncoder(),localParts:Uint8Array[]=[],centralParts:Uint8Array[]=[];
  let localOffset=0,centralSize=0;
  for(const file of files){
    const name=encoder.encode(file.path),data=file.bytes,crc=crc32(data);
    const local=new Uint8Array(30+name.length+data.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0x0021,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);
    local.set(name,30);local.set(data,30+name.length);localParts.push(local);
    const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,0x0021,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,localOffset,true);central.set(name,46);centralParts.push(central);
    localOffset+=local.length;centralSize+=central.length;
  }
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,localOffset,true);ev.setUint16(20,0,true);
  const output=new Uint8Array(localOffset+centralSize+end.length);let offset=0;
  for(const part of localParts){output.set(part,offset);offset+=part.length;}
  for(const part of centralParts){output.set(part,offset);offset+=part.length;}
  output.set(end,offset);return output;
}

export function downloadRestoredEvidence(payload: EvidencePayload): void {
  const files = payload.files.map(entry => {
    const bytes = fromBase64(entry.data);
    const extension = entry.type === "image/png" ? "png" : entry.type === "image/webp" ? "webp" : "jpg";
    return { path: safeName(payload.referenceCode) + "-" + safeName(entry.name) + "." + extension, bytes };
  });
  const manifest = { format: FORMAT, version: VERSION, referenceCode: payload.referenceCode, createdAt: payload.createdAt, restoredAt: new Date().toISOString(), files: payload.files.map(({name,type,size})=>({name,type,size})) };
  files.push({ path: safeName(payload.referenceCode) + "-evidence-manifest.json", bytes: new TextEncoder().encode(JSON.stringify(manifest,null,2)) });
  const archive = zipStored(files);
  const data = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([data], { type: "application/zip" }));
  const link = document.createElement("a"); link.href=url; link.download=safeName(payload.referenceCode)+"-recovered-evidence.zip"; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),120000);
}
