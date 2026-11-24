import { adminRequest } from "../adminApi.js";
import {
  getOrCreateOfflineDeviceIdentity,
  signOfflineEnrollmentChallenge,
  signOfflineEvent,
  verifyOfflinePermitSignature,
  verifyOfflinePermitSnapshot,
} from "./deviceCrypto.js";
import {
  acknowledgeOfflineSale,
  claimOfflineSalesForSync,
  readStoredOfflinePermit,
  readStoredOfflineSnapshot,
  recordOfflineSyncFailure,
  saveVerifiedOfflinePermit,
  type QueuedOfflineSale,
  type StoredOfflinePermit,
} from "./storage.js";

type ApiChallenge = { challenge_id: string; challenge: string; expires_at: string };
type ApiPermit = {
  id: string;
  claims: Record<string, unknown>;
  signature_base64url: string;
  snapshot: Array<Record<string, unknown>>;
};
type ApiSyncResult = {
  outcome: "accepted" | "conflict" | "rejected" | "retry";
  event_id?: string;
  canonical_sale_id?: string;
  receipt_number?: string;
  server_received_at?: string;
  reason_code?: string;
  expected_sequence?: number;
};

const UUID = /^[a-f0-9-]{36}$/i;

export async function enrollOfflineDevice(registerId: string, deviceLabel: string): Promise<{ id: string; device_label: string; status: string }> {
  if (!UUID.test(registerId) || typeof deviceLabel !== "string" || deviceLabel.trim().length < 2 || deviceLabel.trim().length > 100) {
    throw new Error("Choose a valid register and a device label between 2 and 100 characters.");
  }
  const identity = await getOrCreateOfflineDeviceIdentity();
  const challenge = await adminRequest<ApiChallenge>("/api/admin/pos/offline/enrollment-challenges", {
    method: "POST",
    body: JSON.stringify({
      device_id: identity.deviceId,
      register_id: registerId,
      public_key_jwk: identity.publicKeyJwk,
      public_key_thumbprint: identity.publicKeyThumbprint,
    }),
  });
  const proof = await signOfflineEnrollmentChallenge(challenge.challenge);
  const result = await adminRequest<{ enrolled: boolean; device: { id: string; device_label: string; status: string } }>("/api/admin/pos/offline/devices/enroll", {
    method: "POST",
    body: JSON.stringify({
      challenge_id: challenge.challenge_id,
      challenge: challenge.challenge,
      device_id: identity.deviceId,
      register_id: registerId,
      device_label: deviceLabel.trim(),
      public_key_jwk: identity.publicKeyJwk,
      public_key_thumbprint: identity.publicKeyThumbprint,
      signature: proof,
    }),
  });
  if (!result.enrolled || result.device.id !== identity.deviceId || result.device.status !== "active") {
    throw new Error("The server did not confirm enrollment of this browser device.");
  }
  return result.device;
}

export async function issueOfflinePermit(
  deviceId: string,
  sessionId: string,
  cashierAdminId?: string,
  durationHours = 4,
): Promise<ApiPermit> {
  if (!UUID.test(deviceId) || !UUID.test(sessionId) || !Number.isSafeInteger(durationHours) || durationHours < 1 || durationHours > 8) {
    throw new Error("The selected device, shift or permit duration is invalid.");
  }
  const body: Record<string, unknown> = { session_id: sessionId, duration_hours: durationHours };
  if (cashierAdminId) body.cashier_admin_id = cashierAdminId;
  const response = await adminRequest<{ permit: ApiPermit }>(`/api/admin/pos/offline/devices/${deviceId}/permits`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.permit;
}

export async function fetchAndStoreOfflinePermit(deviceId: string): Promise<StoredOfflinePermit> {
  if (!UUID.test(deviceId)) throw new Error("The enrolled device reference is invalid.");
  const identity = await getOrCreateOfflineDeviceIdentity();
  if (identity.deviceId !== deviceId) throw new Error("This permit is for a different browser device.");
  const [keyResponse, permitResponse] = await Promise.all([
    adminRequest<{ algorithm: string; public_key_jwk: JsonWebKey }>("/api/admin/pos/offline/verification-key"),
    adminRequest<{ permit: ApiPermit }>(`/api/admin/pos/offline/devices/${deviceId}/permit`),
  ]);
  if (keyResponse.algorithm !== "ECDSA-P256-SHA256" || !keyResponse.public_key_jwk) {
    throw new Error("The server permit verification key is unavailable or unsupported.");
  }
  const permit = permitResponse.permit;
  if (!permit?.claims || permit.claims.device_id !== deviceId || permit.claims.permit_id !== permit.id ||
      permit.claims.version !== 1 || permit.claims.max_events !== 20 ||
      permit.claims.cash_only !== true || permit.claims.allow_refunds !== false ||
      permit.claims.allow_voids !== false || permit.claims.allow_shift_close !== false ||
      !Array.isArray(permit.claims.allocations) || !Array.isArray(permit.snapshot) ||
      permit.snapshot.length < 1 || permit.snapshot.length > 30 ||
      permit.claims.allocations.length !== permit.snapshot.length) {
    throw new Error("The server returned an invalid or overly permissive offline permit.");
  }
  const claimByAllocation = new Map(permit.claims.allocations.map((item: Record<string, unknown>) => [String(item.allocation_id), item]));
  for (const item of permit.snapshot) {
    const claim = claimByAllocation.get(String(item.allocationId));
    if (!claim || claim.variant_id !== item.variantId || Number(claim.quantity) !== Number(item.allocatedQuantity) ||
        Number(claim.unit_price_paisa) !== Number(item.unitPricePaisa)) {
      throw new Error("The offline catalogue does not match the signed stock allocation claims.");
    }
  }
  if (!await verifyOfflinePermitSignature(permit.claims, permit.signature_base64url, keyResponse.public_key_jwk)) {
    throw new Error("The offline permit signature is invalid. It was not stored.");
  }
  if (!await verifyOfflinePermitSnapshot(permit.snapshot, String(permit.claims.snapshot_hash ?? ""))) {
    throw new Error("The offline product snapshot failed its integrity check. It was not stored.");
  }
  const now = Date.now();
  const issuedAt = Date.parse(String(permit.claims.issued_at ?? ""));
  const expiresAt = Date.parse(String(permit.claims.expires_at ?? ""));
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || issuedAt > now + 60_000 || expiresAt <= now || expiresAt - issuedAt > 8 * 60 * 60_000) {
    throw new Error("The offline permit is expired or outside its allowed validity window.");
  }
  const stored: StoredOfflinePermit = {
    id: "active",
    permitId: permit.id,
    claims: permit.claims,
    signatureBase64Url: permit.signature_base64url,
    verificationPublicKeyJwk: keyResponse.public_key_jwk,
    snapshot: permit.snapshot,
    savedAt: new Date().toISOString(),
  };
  await saveVerifiedOfflinePermit(stored);
  return stored;
}

export async function syncOfflineQueue(deviceId: string): Promise<{ accepted: number; needsReview: number; retrying: number }> {
  if (!UUID.test(deviceId)) throw new Error("The enrolled device reference is invalid.");
  const identity = await getOrCreateOfflineDeviceIdentity();
  if (identity.deviceId !== deviceId) throw new Error("This browser is not the enrolled device for the offline queue.");
  const permit = await readStoredOfflinePermit();
  const snapshot = await readStoredOfflineSnapshot();
  if (!permit || permit.claims.device_id !== deviceId || !snapshot ||
      !await verifyOfflinePermitSignature(permit.claims, permit.signatureBase64Url, permit.verificationPublicKeyJwk) ||
      !await verifyOfflinePermitSnapshot(snapshot, String(permit.claims.snapshot_hash ?? ""))) {
    throw new Error("A verified local permit and catalogue snapshot are required before syncing offline sales.");
  }
  const claimed = await claimOfflineSalesForSync(10);
  if (!claimed.length) return { accepted: 0, needsReview: 0, retrying: 0 };

  let accepted = 0, needsReview = 0, retrying = 0;
  const retry = async (sale: QueuedOfflineSale, reason: string) => {
    await recordOfflineSyncFailure(sale.eventId, /^[a-z0-9_]{2,64}$/i.test(reason) ? reason : "sync_temporary_failure");
    retrying += 1;
  };

  try {
    const envelopes = await Promise.all(claimed.map(async (sale) => ({ event: sale, signature: await signOfflineEvent(sale) })));
    const response = await adminRequest<{ complete: boolean; results: ApiSyncResult[] }>("/api/admin/pos/offline/sync", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, permit_id: permit.permitId, events: envelopes }),
    });
    const results = Array.isArray(response.results) ? response.results : [];
    for (let index = 0; index < claimed.length; index += 1) {
      const sale = claimed[index];
      const result = results[index];
      if (!result) {
        await retry(sale, "sync_result_missing");
        continue;
      }
      const serverReceivedAt = typeof result.server_received_at === "string" && Number.isSafeInteger(Date.parse(result.server_received_at))
        ? result.server_received_at
        : new Date().toISOString();
      if (result.outcome === "accepted" && typeof result.canonical_sale_id === "string" && typeof result.receipt_number === "string") {
        await acknowledgeOfflineSale({
          eventId: sale.eventId,
          outcome: "accepted",
          canonicalSaleId: result.canonical_sale_id,
          receiptNumber: result.receipt_number,
          serverReceivedAt,
        });
        accepted += 1;
      } else if (result.outcome === "conflict" || result.outcome === "rejected") {
        await acknowledgeOfflineSale({
          eventId: sale.eventId,
          outcome: result.outcome,
          reasonCode: result.reason_code || "offline_sale_needs_review",
          serverReceivedAt,
        });
        needsReview += 1;
      } else {
        await retry(sale, result.reason_code || "sync_retry_requested");
      }
      if (result.outcome !== "accepted") {
        for (let rest = index + 1; rest < claimed.length; rest += 1) await retry(claimed[rest], "sync_batch_stopped");
        break;
      }
    }
    return { accepted, needsReview, retrying };
  } catch (caught) {
    for (const sale of claimed) {
      try { await retry(sale, "sync_network_or_server_error"); } catch {}
    }
    if (caught instanceof Error) throw caught;
    throw new Error("Offline sales remain safely stored and will be retried.");
  }
}


export type OfflineShellCheck = {
  ready: boolean;
  cached: string[];
  missing: string[];
  failed: string[];
  cacheName: string;
};

async function requestOfflineShellWorker(type: "PRECACHE_POS_ASSETS" | "CHECK_POS_ASSETS", urls: string[]): Promise<OfflineShellCheck> {
  if (!globalThis.isSecureContext || !("serviceWorker" in navigator)) {
    throw new Error("A secure HTTPS browser with service-worker support is required for emergency offline caching.");
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller ?? registration.active;
  if (!worker) throw new Error("The De VERVE service worker is not active yet. Reload the POS page and try again.");
  return await new Promise<OfflineShellCheck>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("The service worker did not confirm the POS cache operation."));
    }, 20_000);
    channel.port1.onmessage = (event: MessageEvent<OfflineShellCheck>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      if (!event.data || typeof event.data.ready !== "boolean") {
        reject(new Error("The service worker returned an invalid cache status."));
        return;
      }
      resolve(event.data);
    };
    try {
      worker.postMessage({ type, urls }, [channel.port2]);
    } catch (caught) {
      window.clearTimeout(timeout);
      channel.port1.close();
      reject(caught instanceof Error ? caught : new Error("Could not communicate with the service worker."));
    }
  });
}

function collectCurrentPosAssets(): string[] {
  const origin = window.location.origin;
  const urls = new Set<string>(["/", "/brand/de-verve-mark.svg"]);
  for (const entry of performance.getEntriesByType("resource")) {
    if (!(entry instanceof PerformanceResourceTiming)) continue;
    try {
      const url = new URL(entry.name, origin);
      if (url.origin !== origin || url.pathname.startsWith("/api/")) continue;
      if (/\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname)) urls.add(url.href);
    } catch {
      // Ignore browser extensions, data URLs and malformed resource entries.
    }
  }
  return Array.from(urls).slice(0, 120);
}

/** Cache the currently loaded POS application shell and all observed same-origin static dependencies. */
export async function prepareOfflineShell(): Promise<OfflineShellCheck> {
  const urls = collectCurrentPosAssets();
  const result = await requestOfflineShellWorker("PRECACHE_POS_ASSETS", urls);
  if (!result.ready) {
    const failures = [...(result.failed ?? []), ...(result.missing ?? [])];
    throw new Error(`Emergency offline cache is incomplete (${failures.length} assets could not be verified). Keep using online POS and retry after all assets load.`);
  }
  return result;
}

/** Re-checks actual service-worker cache contents; a previous visit alone is not proof of offline readiness. */
export async function checkOfflineShellReady(): Promise<OfflineShellCheck> {
  return requestOfflineShellWorker("CHECK_POS_ASSETS", collectCurrentPosAssets());
}
