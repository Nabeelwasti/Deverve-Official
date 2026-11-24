export const OFFLINE_POS_DB_NAME = "deverve-pos-emergency";
export const OFFLINE_POS_DB_VERSION = 1;

export type OfflineSaleLine = {
  variantId: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  unitPricePaisa: number;
  lineTotalPaisa: number;
};

export type OfflineSaleDraft = {
  eventId: string;
  idempotencyKey: string;
  deviceId: string;
  permitId: string;
  registerId: string;
  sessionId: string;
  cashierId: string;
  snapshotVersion: string;
  createdAt: string;
  currency: "PKR";
  lines: OfflineSaleLine[];
  subtotalPaisa: number;
  totalPaisa: number;
  cashTenderedPaisa: number;
  changePaisa: number;
};

export type QueuedOfflineSale = OfflineSaleDraft & {
  sequence: number;
  status: "pending";
  payloadVersion: 1;
};

export type OfflineStorageHealth = {
  supported: boolean;
  secureContext: boolean;
  persistentStorageGranted: boolean;
  quotaBytes: number | null;
  usageBytes: number | null;
  availableBytes: number | null;
  databaseWritable: boolean;
  checkoutStorageReady: boolean;
  reasons: string[];
};

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function createStore(database: IDBDatabase, transaction: IDBTransaction, name: string, options: IDBObjectStoreParameters): IDBObjectStore {
  return database.objectStoreNames.contains(name) ? transaction.objectStore(name) : database.createObjectStore(name, options);
}

export function openOfflinePosDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("This browser does not support local POS storage."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_POS_DB_NAME, OFFLINE_POS_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const upgrade = request.transaction;
      if (!upgrade) throw new Error("Local POS database upgrade transaction is unavailable.");
      createStore(database, upgrade, "meta", { keyPath: "id" });
      createStore(database, upgrade, "device", { keyPath: "id" });
      createStore(database, upgrade, "permit", { keyPath: "id" });
      createStore(database, upgrade, "catalogue", { keyPath: "id" });
      createStore(database, upgrade, "shift", { keyPath: "id" });
      const sales = createStore(database, upgrade, "sales", { keyPath: "eventId" });
      if (!sales.indexNames.contains("idempotencyKey")) sales.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
      const outbox = createStore(database, upgrade, "outbox", { keyPath: "eventId" });
      if (!outbox.indexNames.contains("sequence")) outbox.createIndex("sequence", "sequence", { unique: true });
      if (!outbox.indexNames.contains("status")) outbox.createIndex("status", "status");
      createStore(database, upgrade, "syncReceipts", { keyPath: "eventId" });
      createStore(database, upgrade, "audit", { keyPath: "id", autoIncrement: true });
    };
    request.onblocked = () => reject(new Error("Close other De VERVE POS tabs to finish the local database upgrade."));
    request.onerror = () => reject(request.error ?? new Error("Local POS database could not be opened."));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function validateSaleDraft(draft: OfflineSaleDraft): void {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("Offline sale payload is invalid.");
  const allowedDraftKeys = new Set(["eventId", "idempotencyKey", "deviceId", "permitId", "registerId", "sessionId", "cashierId", "snapshotVersion", "createdAt", "currency", "lines", "subtotalPaisa", "totalPaisa", "cashTenderedPaisa", "changePaisa"]);
  if (Object.keys(draft).some((key) => !allowedDraftKeys.has(key))) throw new Error("Offline sale contains fields that are not permitted for local storage.");
  const requiredIds = [draft.eventId, draft.idempotencyKey, draft.deviceId, draft.permitId, draft.registerId, draft.sessionId, draft.cashierId, draft.snapshotVersion];
  if (requiredIds.some((value) => typeof value !== "string" || value.length < 8 || value.length > 160)) {
    throw new Error("Offline sale is missing a valid device, permit, shift or event reference.");
  }
  if (!/^[a-f0-9-]{36}$/i.test(draft.eventId) || !/^[a-f0-9-]{36}$/i.test(draft.idempotencyKey)) throw new Error("Offline sale event and idempotency references must be UUIDs.");
  if (draft.currency !== "PKR" || typeof draft.createdAt !== "string" || !Number.isSafeInteger(Date.parse(draft.createdAt))) throw new Error("Offline sale currency or timestamp is invalid.");
  if (!Array.isArray(draft.lines) || draft.lines.length < 1 || draft.lines.length > 30) throw new Error("Offline sale must contain between 1 and 30 item lines.");
  const seenVariants = new Set<string>();
  for (const line of draft.lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) throw new Error("Offline sale contains an invalid product snapshot.");
    const allowedLineKeys = new Set(["variantId", "sku", "productName", "size", "color", "quantity", "unitPricePaisa", "lineTotalPaisa"]);
    if (Object.keys(line).some((key) => !allowedLineKeys.has(key))) throw new Error("Offline sale product snapshot contains unsupported fields.");
    if ([line.variantId, line.productName, line.sku, line.size, line.color].some((value) => typeof value !== "string") || !line.variantId || line.variantId.length > 160 || line.productName.length > 160 || line.sku.length > 100 || line.size.length > 50 || line.color.length > 80) {
      throw new Error("Offline sale contains an invalid product snapshot.");
    }
    if (seenVariants.has(line.variantId)) throw new Error("Offline sale product lines must be combined by variant.");
    seenVariants.add(line.variantId);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 30) throw new Error("Offline sale quantity is outside the allowed limit.");
    if (!Number.isSafeInteger(line.unitPricePaisa) || line.unitPricePaisa < 0 || !Number.isSafeInteger(line.lineTotalPaisa) || line.lineTotalPaisa < 0) {
      throw new Error("Offline sale contains an invalid price.");
    }
    const computedLineTotal = line.quantity * line.unitPricePaisa;
    if (!Number.isSafeInteger(computedLineTotal) || computedLineTotal !== line.lineTotalPaisa) throw new Error("Offline sale line total does not match its quantity and unit price.");
  }
  const values = [draft.subtotalPaisa, draft.totalPaisa, draft.cashTenderedPaisa, draft.changePaisa];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("Offline sale contains an invalid amount.");
  const calculatedTotal = draft.lines.reduce((sum, line) => sum + line.lineTotalPaisa, 0);
  if (!Number.isSafeInteger(calculatedTotal) || calculatedTotal !== draft.subtotalPaisa || draft.totalPaisa !== draft.subtotalPaisa) {
    throw new Error("Offline sale total does not match the saved item lines.");
  }
  if (draft.cashTenderedPaisa < draft.totalPaisa || draft.cashTenderedPaisa - draft.totalPaisa !== draft.changePaisa) {
    throw new Error("Offline cash tender or change does not balance.");
  }
}

export async function queueOfflineSale(draft: OfflineSaleDraft): Promise<QueuedOfflineSale> {
  validateSaleDraft(draft);
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise<QueuedOfflineSale>((resolve, reject) => {
      let queued: QueuedOfflineSale | null = null;
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(["meta", "sales", "outbox", "audit"], "readwrite", { durability: "strict" });
      } catch {
        transaction = database.transaction(["meta", "sales", "outbox", "audit"], "readwrite");
      }
      const meta = transaction.objectStore("meta");
      const sequenceRequest = meta.get("device-sequence");
      sequenceRequest.onsuccess = () => {
        const current = sequenceRequest.result as { id: string; value: number } | undefined;
        const sequence = (current?.value ?? 0) + 1;
        queued = { ...draft, sequence, status: "pending", payloadVersion: 1 };
        transaction.objectStore("sales").add(queued);
        transaction.objectStore("outbox").add({
          eventId: draft.eventId,
          sequence,
          status: "pending",
          attempts: 0,
          nextAttemptAt: 0,
          lastErrorCode: null,
        });
        transaction.objectStore("audit").add({
          action: "offline_sale_queued",
          eventId: draft.eventId,
          sequence,
          recordedAt: new Date().toISOString(),
        });
        meta.put({ id: "device-sequence", value: sequence });
      };
      sequenceRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        if (queued) resolve(queued);
        else reject(new Error("Offline sale transaction completed without a sale record."));
      };
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline sale was not saved. No sale was recorded locally."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Offline sale could not be saved."));
    });
  } finally {
    database.close();
  }
}

export async function inspectOfflineStorage(requestPersistence = true): Promise<OfflineStorageHealth> {
  const reasons: string[] = [];
  const supported = typeof indexedDB !== "undefined";
  const secureContext = typeof isSecureContext !== "undefined" && isSecureContext;
  if (!supported) reasons.push("IndexedDB is unavailable in this browser.");
  if (!secureContext) reasons.push("Secure HTTPS context is required for offline POS cryptography.");
  if (!supported) {
    return { supported, secureContext, persistentStorageGranted: false, quotaBytes: null, usageBytes: null, availableBytes: null, databaseWritable: false, checkoutStorageReady: false, reasons };
  }

  let persistentStorageGranted = false;
  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;
  let availableBytes: number | null = null;
  let databaseWritable = false;
  let quotaInspected = false;

  try {
    if (navigator.storage?.persisted) {
      persistentStorageGranted = await navigator.storage.persisted();
      if (!persistentStorageGranted && requestPersistence && navigator.storage.persist) {
        persistentStorageGranted = await navigator.storage.persist();
      }
    }
  } catch {
    reasons.push("Browser persistent-storage permission could not be verified.");
  }
  if (!persistentStorageGranted) reasons.push("Browser has not granted persistent storage; emergency checkout stays disabled.");

  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate) {
      quotaBytes = typeof estimate.quota === "number" ? estimate.quota : null;
      usageBytes = typeof estimate.usage === "number" ? estimate.usage : null;
      if (quotaBytes !== null && usageBytes !== null) {
        availableBytes = Math.max(0, quotaBytes - usageBytes);
        quotaInspected = true;
      }
    }
  } catch {
    reasons.push("Browser storage quota could not be inspected.");
  }
  if (!quotaInspected) reasons.push("Browser storage quota information is unavailable.");
  if (availableBytes !== null && availableBytes < 5 * 1024 * 1024) reasons.push("Less than 5 MiB of estimated browser storage remains.");

  let database: IDBDatabase | null = null;
  try {
    database = await openOfflinePosDatabase();
    const transaction = database.transaction(["meta"], "readwrite");
    const store = transaction.objectStore("meta");
    const probeId = "storage-health-probe";
    store.put({ id: probeId, value: Date.now() });
    store.delete(probeId);
    await transactionDone(transaction);
    databaseWritable = true;
  } catch {
    reasons.push("The local POS database failed its write test.");
  } finally {
    database?.close();
  }

  if (!databaseWritable && !reasons.includes("The local POS database failed its write test.")) reasons.push("Local POS storage is not writable.");
  return {
    supported,
    secureContext,
    persistentStorageGranted,
    quotaBytes,
    usageBytes,
    availableBytes,
    databaseWritable,
    checkoutStorageReady: supported && secureContext && persistentStorageGranted && databaseWritable && quotaInspected && availableBytes !== null && availableBytes >= 5 * 1024 * 1024,
    reasons,
  };
}



export type OfflineOutboxRecord = {
  eventId: string;
  sequence: number;
  status: "pending" | "syncing" | "needs_review" | "synced";
  attempts: number;
  nextAttemptAt: number;
  lastErrorCode: string | null;
  claimedUntil?: number;
};

export type OfflineSyncReceipt = {
  eventId: string;
  outcome: "accepted" | "already_accepted" | "conflict" | "rejected";
  canonicalSaleId?: string;
  receiptNumber?: string;
  serverReceivedAt: string;
  reasonCode?: string;
};

function assertEventId(eventId: string): void {
  if (typeof eventId !== "string" || !/^[a-f0-9-]{36}$/i.test(eventId)) {
    throw new Error("A valid offline sale event ID is required.");
  }
}

/** Returns pending events in strict device sequence order. It never mutates or removes sale evidence. */
export async function listPendingOfflineSales(limit = 10): Promise<QueuedOfflineSale[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Offline sync batch size must be between 1 and 20.");
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["sales", "outbox"], "readonly");
      const salesRequest = transaction.objectStore("sales").getAll();
      const outboxRequest = transaction.objectStore("outbox").getAll();
      transaction.oncomplete = () => {
        const outbox = (outboxRequest.result as OfflineOutboxRecord[])
          .filter((record) => record.status === "pending" && record.nextAttemptAt <= Date.now())
          .sort((a, b) => a.sequence - b.sequence)
          .slice(0, limit);
        const byId = new Map((salesRequest.result as QueuedOfflineSale[]).map((sale) => [sale.eventId, sale]));
        const ordered: QueuedOfflineSale[] = [];
        for (const record of outbox) {
          const sale = byId.get(record.eventId);
          if (!sale || sale.sequence !== record.sequence) {
            reject(new Error("Offline sale queue integrity check failed. Stop syncing and request owner review."));
            return;
          }
          ordered.push(sale);
        }
        resolve(ordered);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Offline queue could not be read."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline queue read was interrupted."));
    });
  } finally {
    database.close();
  }
}

/** Records a retryable failure without changing the immutable sale payload or its idempotency key. */
export async function recordOfflineSyncFailure(eventId: string, errorCode: string, retryAt = Date.now() + 30_000): Promise<void> {
  assertEventId(eventId);
  if (!/^[a-z0-9_]{2,64}$/i.test(errorCode) || !Number.isSafeInteger(retryAt) || retryAt < 0) {
    throw new Error("Offline retry metadata is invalid.");
  }
  const database = await openOfflinePosDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["outbox", "audit"], "readwrite");
      const store = transaction.objectStore("outbox");
      const request = store.get(eventId);
      request.onsuccess = () => {
        const current = request.result as OfflineOutboxRecord | undefined;
        if (!current || current.status === "synced" || current.status === "needs_review") {
          transaction.abort();
          return;
        }
        store.put({ ...current, status: "pending", attempts: current.attempts + 1, nextAttemptAt: retryAt, lastErrorCode: errorCode, claimedUntil: undefined });
        transaction.objectStore("audit").add({ action: "offline_sync_retry_scheduled", eventId, errorCode, recordedAt: new Date().toISOString() });
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline retry state could not be saved."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Offline retry state could not be saved."));
    });
  } finally {
    database.close();
  }
}


function sameSyncReceipt(left: OfflineSyncReceipt, right: OfflineSyncReceipt): boolean {
  return left.eventId === right.eventId &&
    left.outcome === right.outcome &&
    left.canonicalSaleId === right.canonicalSaleId &&
    left.receiptNumber === right.receiptNumber &&
    left.serverReceivedAt === right.serverReceivedAt &&
    left.reasonCode === right.reasonCode;
}

/** Stores server acknowledgement atomically. Replayed acknowledgements are accepted only if identical. */
export async function acknowledgeOfflineSale(receipt: OfflineSyncReceipt): Promise<void> {
  assertEventId(receipt?.eventId);
  if (!receipt || !["accepted", "already_accepted", "conflict", "rejected"].includes(receipt.outcome) ||
      !Number.isSafeInteger(Date.parse(receipt.serverReceivedAt))) {
    throw new Error("Offline sync acknowledgement is invalid.");
  }
  if ((receipt.outcome === "accepted" || receipt.outcome === "already_accepted") &&
      (typeof receipt.canonicalSaleId !== "string" || !receipt.canonicalSaleId || typeof receipt.receiptNumber !== "string" || !receipt.receiptNumber)) {
    throw new Error("An accepted offline sale must include its canonical server sale and receipt references.");
  }
  if ((receipt.outcome === "conflict" || receipt.outcome === "rejected") &&
      (typeof receipt.reasonCode !== "string" || !/^[a-z0-9_]{2,64}$/i.test(receipt.reasonCode))) {
    throw new Error("A rejected or conflicted offline sale must include a stable reason code.");
  }
  const database = await openOfflinePosDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["sales", "outbox", "syncReceipts", "audit"], "readwrite");
      const sales = transaction.objectStore("sales");
      const outbox = transaction.objectStore("outbox");
      const existingReceiptRequest = transaction.objectStore("syncReceipts").get(receipt.eventId);
      const saleRequest = sales.get(receipt.eventId);
      const outboxRequest = outbox.get(receipt.eventId);
      let invalid = false;
      let reads = 0;
      const finishReads = () => {
        reads += 1;
        if (reads !== 3 || invalid) return;
        const previous = existingReceiptRequest.result as OfflineSyncReceipt | undefined;
        const sale = saleRequest.result as QueuedOfflineSale | undefined;
        const queue = outboxRequest.result as OfflineOutboxRecord | undefined;
        if (!sale || !queue || sale.eventId !== receipt.eventId || queue.eventId !== receipt.eventId) {
          invalid = true;
          transaction.abort();
          return;
        }
        if (previous) {
          if (!sameSyncReceipt(previous, receipt)) {
            invalid = true;
            transaction.abort();
          }
          return;
        }
        const status = receipt.outcome === "accepted" || receipt.outcome === "already_accepted" ? "synced" :
          receipt.outcome === "conflict" || receipt.outcome === "rejected" ? "needs_review" : "pending";
        outbox.put({ ...queue, status, lastErrorCode: receipt.reasonCode ?? null, claimedUntil: undefined });
        transaction.objectStore("syncReceipts").add(receipt);
        transaction.objectStore("audit").add({
          action: status === "synced" ? "offline_sale_acknowledged" : "offline_sale_needs_review",
          eventId: receipt.eventId,
          outcome: receipt.outcome,
          reasonCode: receipt.reasonCode ?? null,
          recordedAt: new Date().toISOString(),
        });
      };
      existingReceiptRequest.onsuccess = finishReads;
      saleRequest.onsuccess = finishReads;
      outboxRequest.onsuccess = finishReads;
      existingReceiptRequest.onerror = saleRequest.onerror = outboxRequest.onerror = () => {
        invalid = true;
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline sale acknowledgement could not be committed."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Offline sale acknowledgement could not be committed."));
    });
  } finally {
    database.close();
  }
}


/**
 * Atomically leases the next sequential batch to one tab. A crashed tab's lease
 * expires, allowing a later foreground session to retry the exact same events.
 */
export async function claimOfflineSalesForSync(limit = 10, now = Date.now(), leaseMs = 30_000): Promise<QueuedOfflineSale[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20 ||
      !Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 120_000) {
    throw new Error("Offline sync lease parameters are invalid.");
  }
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["sales", "outbox", "audit"], "readwrite");
      const salesRequest = transaction.objectStore("sales").getAll();
      const outboxStore = transaction.objectStore("outbox");
      const outboxRequest = outboxStore.getAll();
      let claimed: QueuedOfflineSale[] = [];
      let prepared = false;
      const prepare = () => {
        if (prepared || salesRequest.readyState !== "done" || outboxRequest.readyState !== "done") return;
        prepared = true;
        const saleById = new Map((salesRequest.result as QueuedOfflineSale[]).map((sale) => [sale.eventId, sale]));
        const eligible = (outboxRequest.result as OfflineOutboxRecord[])
          .filter((record) =>
            (record.status === "pending" && record.nextAttemptAt <= now) ||
            (record.status === "syncing" && (record.claimedUntil ?? 0) <= now))
          .sort((a, b) => a.sequence - b.sequence)
          .slice(0, limit);
        const audit = transaction.objectStore("audit");
        for (const record of eligible) {
          const sale = saleById.get(record.eventId);
          if (!sale || sale.sequence !== record.sequence) {
            transaction.abort();
            return;
          }
          outboxStore.put({ ...record, status: "syncing", claimedUntil: now + leaseMs });
          audit.add({ action: "offline_sale_sync_claimed", eventId: record.eventId, sequence: record.sequence, claimedAt: new Date(now).toISOString() });
          claimed.push(sale);
        }
      };
      salesRequest.onsuccess = prepare;
      outboxRequest.onsuccess = prepare;
      salesRequest.onerror = outboxRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve(claimed);
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline sales could not be leased for sync."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Offline sales could not be leased for sync."));
    });
  } finally {
    database.close();
  }
}
