import { openOfflinePosDatabase } from "./storage";

const DEVICE_RECORD_ID = "identity";
const SIGNING_CONTEXT = "deverve-offline-pos:event:v1\n";

export type OfflineDeviceIdentity = {
  id: string;
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  publicKeyThumbprint: string;
  createdAt: string;
};

type StoredDeviceIdentity = OfflineDeviceIdentity & {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Signed event contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalize(record[key])).join(",") + "}";
  }
  throw new Error("Signed event contains an unsupported value.");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function thumbprint(jwk: JsonWebKey): Promise<string> {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.x !== "string" || typeof jwk.y !== "string") {
    throw new Error("The device public key is not a valid P-256 key.");
  }
  const canonical = JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y });
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))));
}

async function validateStoredIdentity(identity: StoredDeviceIdentity): Promise<void> {
  const privateAlgorithm = identity.privateKey?.algorithm as EcKeyAlgorithm | undefined;
  const publicAlgorithm = identity.publicKey?.algorithm as EcKeyAlgorithm | undefined;
  if (
    !identity.privateKey ||
    identity.privateKey.type !== "private" ||
    identity.privateKey.extractable !== false ||
    identity.privateKey.usages.length !== 1 ||
    !identity.privateKey.usages.includes("sign") ||
    privateAlgorithm?.name !== "ECDSA" ||
    privateAlgorithm.namedCurve !== "P-256" ||
    !identity.publicKey ||
    identity.publicKey.type !== "public" ||
    !identity.publicKey.usages.includes("verify") ||
    publicAlgorithm?.name !== "ECDSA" ||
    publicAlgorithm.namedCurve !== "P-256"
  ) {
    throw new Error("The stored offline POS signing identity failed its cryptographic integrity checks. Re-enrol this device online.");
  }
  const calculatedThumbprint = await thumbprint(identity.publicKeyJwk);
  if (calculatedThumbprint !== identity.publicKeyThumbprint) {
    throw new Error("The stored offline POS public-key fingerprint does not match its identity record.");
  }
}

function readIdentity(database: IDBDatabase): Promise<StoredDeviceIdentity | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["device"], "readonly");
    const request = transaction.objectStore("device").get(DEVICE_RECORD_ID);
    request.onsuccess = () => resolve(request.result as StoredDeviceIdentity | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read the local device identity."));
  });
}

export async function getOrCreateOfflineDeviceIdentity(): Promise<OfflineDeviceIdentity> {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle) {
    throw new Error("HTTPS and Web Crypto are required to enrol an offline POS device.");
  }
  const database = await openOfflinePosDatabase();
  try {
    const existing = await readIdentity(database);
    if (existing?.privateKey && existing.publicKey && existing.publicKeyJwk) {
      await validateStoredIdentity(existing);
      return {
        id: existing.id,
        deviceId: existing.deviceId,
        publicKeyJwk: existing.publicKeyJwk,
        publicKeyThumbprint: existing.publicKeyThumbprint,
        createdAt: existing.createdAt,
      };
    }

    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    ) as CryptoKeyPair;
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const publicKeyThumbprint = await thumbprint(publicKeyJwk);
    const record: StoredDeviceIdentity = {
      id: DEVICE_RECORD_ID,
      deviceId: crypto.randomUUID(),
      publicKeyJwk,
      publicKeyThumbprint,
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      createdAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["device"], "readwrite");
      transaction.objectStore("device").add(record);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("Device identity could not be saved."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Device identity could not be saved."));
    }).catch(async (error) => {
      // Another tab may have enrolled this browser at the same time. Reuse its
      // committed identity rather than replacing or overwriting its key.
      const winner = await readIdentity(database);
      if (!winner?.privateKey) throw error;
    });

    const saved = await readIdentity(database);
    if (!saved?.privateKey) throw new Error("The local device signing key was not persisted.");
    await validateStoredIdentity(saved);
    return {
      id: saved.id,
      deviceId: saved.deviceId,
      publicKeyJwk: saved.publicKeyJwk,
      publicKeyThumbprint: saved.publicKeyThumbprint,
      createdAt: saved.createdAt,
    };
  } finally {
    database.close();
  }
}

/**
 * Signs a canonical event using the enrolled device key. This proves possession
 * of the browser-held key; it does not make browser storage hardware-backed or
 * protect the key from same-origin script compromise.
 */
/**
 * Signs a one-time server challenge to prove possession of this browser's
 * non-extractable device private key during online enrollment.
 */
export async function signOfflineEnrollmentChallenge(challenge: string): Promise<string> {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle) {
    throw new Error("HTTPS and Web Crypto are required to enrol an offline POS device.");
  }
  if (typeof challenge !== "string" || challenge.length < 32 || challenge.length > 256) {
    throw new Error("The server enrollment challenge is invalid.");
  }
  const database = await openOfflinePosDatabase();
  try {
    const identity = await readIdentity(database);
    if (!identity?.privateKey) throw new Error("Create the local device identity before requesting enrollment.");
    await validateStoredIdentity(identity);
    const message = new TextEncoder().encode("deverve-offline-pos:enroll:v1\n" + challenge);
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identity.privateKey,
      message,
    );
    return toBase64Url(new Uint8Array(signature));
  } finally {
    database.close();
  }
}

export async function signOfflineEvent(payload: unknown): Promise<string> {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle) {
    throw new Error("HTTPS and Web Crypto are required to sign an offline sale.");
  }
  const database = await openOfflinePosDatabase();
  try {
    const identity = await readIdentity(database);
    if (!identity?.privateKey) throw new Error("This browser has not enrolled an offline POS device.");
    const message = new TextEncoder().encode(SIGNING_CONTEXT + canonicalize(payload));
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identity.privateKey,
      message,
    );
    return toBase64Url(new Uint8Array(signature));
  } finally {
    database.close();
  }
}

/**
 * Verifies the server-issued offline permit before it is stored or used.
 * The public key must be pinned from the authenticated same-origin bootstrap;
 * never accept a key supplied only inside an untrusted permit payload.
 */
export async function verifyOfflinePermitSignature(
  claims: unknown,
  signatureBase64Url: string,
  pinnedPublicKeyJwk: JsonWebKey,
): Promise<boolean> {
  try {
    if (!globalThis.isSecureContext || !globalThis.crypto?.subtle ||
        typeof signatureBase64Url !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(signatureBase64Url) ||
        pinnedPublicKeyJwk.kty !== "EC" || pinnedPublicKeyJwk.crv !== "P-256" ||
        typeof pinnedPublicKeyJwk.x !== "string" || typeof pinnedPublicKeyJwk.y !== "string" ||
        "d" in pinnedPublicKeyJwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: pinnedPublicKeyJwk.x, y: pinnedPublicKeyJwk.y, ext: true, key_ops: ["verify"] },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const message = new TextEncoder().encode("deverve-offline-pos:permit:v1\\n" + canonicalize(claims));
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Uint8Array.from(atob(signatureBase64Url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - signatureBase64Url.length % 4) % 4)), (char) => char.charCodeAt(0)),
      message,
    );
  } catch {
    return false;
  }
}
