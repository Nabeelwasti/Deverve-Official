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
        transaction = database.transaction(["meta", "permit", "catalogue", "shift", "sales", "outbox", "audit"], "readwrite", { durability: "strict" });
      } catch {
        transaction = database.transaction(["meta", "permit", "catalogue", "shift", "sales", "outbox", "audit"], "readwrite");
      }
      const meta = transaction.objectStore("meta");
      const permitRequest = transaction.objectStore("permit").get("active");
      const catalogueRequest = transaction.objectStore("catalogue").get("active");
      const shiftRequest = transaction.objectStore("shift").get("active");
      const salesRequest = transaction.objectStore("sales").getAll();
      const outboxRequest = transaction.objectStore("outbox").getAll();
      const shellRequest = meta.get("offline-shell-ready");
      const sequenceRequest = meta.get("device-sequence");
      sequenceRequest.onsuccess = () => {
        const permit = permitRequest.result as StoredOfflinePermit | undefined;
        const catalogue = catalogueRequest.result as { snapshotVersion?: string; items?: Array<Record<string, unknown>> } | undefined;
        const shift = shiftRequest.result as Record<string, unknown> | undefined;
        const shell = shellRequest.result as { value?: boolean } | undefined;
        const claims = permit?.claims;
        const now = Date.now();
        if (!permit || !claims || !catalogue || !Array.isArray(catalogue.items) || !shift || shell?.value !== true ||
            claims.offline_checkout_enabled !== true || claims.device_id !== draft.deviceId ||
            claims.permit_id !== draft.permitId || claims.register_id !== draft.registerId ||
            claims.session_id !== draft.sessionId || claims.cashier_admin_id !== draft.cashierId ||
            claims.snapshot_version !== draft.snapshotVersion || catalogue.snapshotVersion !== draft.snapshotVersion ||
            shift.sessionId !== draft.sessionId || shift.registerId !== draft.registerId || shift.cashierId !== draft.cashierId ||
            Date.parse(String(claims.expires_at ?? "")) <= now || Number(claims.max_events) < 1 ||
            claims.cash_only !== true || claims.allow_refunds !== false || claims.allow_voids !== false || claims.allow_shift_close !== false) {
          transaction.abort();
          reject(new Error("A current verified permit, matching open shift, and verified offline app cache are required."));
          return;
        }
        const existingSales = salesRequest.result as QueuedOfflineSale[];
        const existingOutbox = outboxRequest.result as OfflineOutboxRecord[];
        if (existingOutbox.some((record) => record.status === "needs_review")) {
          transaction.abort();
          reject(new Error("An earlier offline sale needs owner review. Stop offline checkout until it is resolved."));
          return;
        }
        const permitSales = existingSales.filter((sale) => sale.permitId === draft.permitId);
        if (permitSales.length >= Number(claims.max_events)) {
          transaction.abort();
          reject(new Error("This offline permit has reached its signed sale-event limit."));
          return;
        }
        const allocatedByVariant = new Map(catalogue.items.map((item) => [String(item.variantId), item]));
        const usedByVariant = new Map<string, number>();
        for (const sale of permitSales) {
          for (const line of sale.lines) usedByVariant.set(line.variantId, (usedByVariant.get(line.variantId) ?? 0) + line.quantity);
        }
        for (const line of draft.lines) {
          const snapshot = allocatedByVariant.get(line.variantId);
          const used = usedByVariant.get(line.variantId) ?? 0;
          if (!snapshot || line.productName !== snapshot.productName || line.sku !== snapshot.sku ||
              line.size !== snapshot.size || line.color !== snapshot.color ||
              line.unitPricePaisa !== snapshot.unitPricePaisa ||
              line.quantity > Number(snapshot.allocatedQuantity) - used) {
            transaction.abort();
            reject(new Error("The sale contains a product or quantity outside this device's signed stock allocation."));
            return;
          }
        }
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

/**
 * Selects only the contiguous device-sequence prefix that is safe to send.
 * A retry delay, live lease, missing sequence, or manual-review event blocks
 * every later event. This prevents a later cash sale from being reconciled
 * before an earlier event whose outcome is still unknown.
 */
function selectSequentialSyncRecords(
  records: OfflineOutboxRecord[],
  now: number,
  limit: number,
  allowExpiredLease: boolean,
): OfflineOutboxRecord[] {
  const ordered = [...records].sort((a, b) => a.sequence - b.sequence);
  const selected: OfflineOutboxRecord[] = [];
  let expectedSequence = 1;

  for (const record of ordered) {
    if (!Number.isSafeInteger(record.sequence) || record.sequence !== expectedSequence) {
      throw new Error("Offline device sequence has a gap or duplicate. Stop syncing and request owner review.");
    }
    expectedSequence += 1;

    if (record.status === "synced") continue;
    const pendingDue = record.status === "pending" && record.nextAttemptAt <= now;
    const expiredLease = allowExpiredLease && record.status === "syncing" && (record.claimedUntil ?? 0) <= now;
    if (!pendingDue && !expiredLease) break;

    selected.push(record);
    if (selected.length >= limit) break;
  }
  return selected;
}

/** Returns pending events in strict device sequence order. It never mutates or removes sale evidence. */
export async function listOfflineSalesForPermit(permitId: string): Promise<QueuedOfflineSale[]> {
  if (typeof permitId !== "string" || permitId.length < 8 || permitId.length > 160) {
    throw new Error("Offline permit reference is invalid.");
  }
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["sales"], "readonly");
      const request = transaction.objectStore("sales").getAll();
      request.onsuccess = () => {
        const records = request.result as QueuedOfflineSale[];
        resolve(records.filter((sale) => sale.permitId === permitId).sort((a, b) => a.sequence - b.sequence));
      };
      request.onerror = () => reject(request.error ?? new Error("Offline permit sales could not be read."));
    });
  } finally {
    database.close();
  }
}

export type OfflineQueueSummary = {
  sale: QueuedOfflineSale;
  outbox: OfflineOutboxRecord;
  receipt: OfflineSyncReceipt | null;
};

/** Returns durable, ordered local sale evidence and its sync state for the active permit. */
export async function listOfflineQueueForPermit(permitId: string): Promise<OfflineQueueSummary[]> {
  if (typeof permitId !== "string" || permitId.length < 8 || permitId.length > 160) {
    throw new Error("Offline permit reference is invalid.");
  }
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["sales", "outbox", "syncReceipts"], "readonly");
      const salesRequest = transaction.objectStore("sales").getAll();
      const outboxRequest = transaction.objectStore("outbox").getAll();
      const receiptsRequest = transaction.objectStore("syncReceipts").getAll();
      transaction.oncomplete = () => {
        const sales = (salesRequest.result as QueuedOfflineSale[]).filter((sale) => sale.permitId === permitId);
        const outbox = new Map((outboxRequest.result as OfflineOutboxRecord[]).map((record) => [record.eventId, record]));
        const receipts = new Map((receiptsRequest.result as OfflineSyncReceipt[]).map((receipt) => [receipt.eventId, receipt]));
        const rows: OfflineQueueSummary[] = [];
        for (const sale of sales) {
          const record = outbox.get(sale.eventId);
          if (!record || record.sequence !== sale.sequence) {
            reject(new Error("Local offline sale evidence is incomplete. Stop checkout and request owner reconciliation."));
            return;
          }
          rows.push({ sale, outbox: record, receipt: receipts.get(sale.eventId) ?? null });
        }
        resolve(rows.sort((a, b) => a.sale.sequence - b.sale.sequence));
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Offline sale queue could not be read."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline sale queue read was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function listPendingOfflineSales(limit = 10): Promise<QueuedOfflineSale[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Offline sync batch size must be between 1 and 20.");
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["sales", "outbox"], "readonly");
      const salesRequest = transaction.objectStore("sales").getAll();
      const outboxRequest = transaction.objectStore("outbox").getAll();
      transaction.oncomplete = () => {
        let outbox: OfflineOutboxRecord[];
        try {
          outbox = selectSequentialSyncRecords(
            outboxRequest.result as OfflineOutboxRecord[],
            Date.now(),
            limit,
            false,
          );
        } catch (caught) {
          reject(caught instanceof Error ? caught : new Error("Offline queue sequence integrity check failed."));
          return;
        }
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
export async function recordOfflineSyncFailure(eventId: string, errorCode: string, retryAt?: number): Promise<void> {
  assertEventId(eventId);
  if (!/^[a-z0-9_]{2,64}$/i.test(errorCode) || (retryAt !== undefined && (!Number.isSafeInteger(retryAt) || retryAt < 0))) {
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
        const attempts = Number.isSafeInteger(current.attempts) ? current.attempts + 1 : 1;
        const backoffMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempts, 6));
        store.put({ ...current, status: "pending", attempts, nextAttemptAt: retryAt ?? Date.now() + backoffMs, lastErrorCode: errorCode, claimedUntil: undefined });
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
export async function readOfflineSyncReceipt(eventId: string): Promise<OfflineSyncReceipt | null> {
  assertEventId(eventId);
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["syncReceipts"], "readonly");
      const request = transaction.objectStore("syncReceipts").get(eventId);
      request.onsuccess = () => resolve((request.result as OfflineSyncReceipt | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Offline sync receipt could not be read."));
    });
  } finally {
    database.close();
  }
}

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
        let eligible: OfflineOutboxRecord[];
        try {
          eligible = selectSequentialSyncRecords(
            outboxRequest.result as OfflineOutboxRecord[],
            now,
            limit,
            true,
          );
        } catch (caught) {
          reject(caught instanceof Error ? caught : new Error("Offline queue sequence integrity check failed."));
          transaction.abort();
          return;
        }
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


export type StoredOfflinePermit = {
  id: "active";
  permitId: string;
  claims: Record<string, unknown>;
  signatureBase64Url: string;
  verificationPublicKeyJwk: JsonWebKey;
  snapshot: Array<Record<string, unknown>>;
  savedAt: string;
};

export async function saveVerifiedOfflinePermit(record: StoredOfflinePermit): Promise<void> {
  if (!record || record.id !== "active" || typeof record.permitId !== "string" ||
      !record.claims || typeof record.claims !== "object" || typeof record.signatureBase64Url !== "string" ||
      !record.verificationPublicKeyJwk || !Array.isArray(record.snapshot) || !record.snapshot.length ||
      typeof record.savedAt !== "string") throw new Error("Verified offline permit record is invalid.");
  const database = await openOfflinePosDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["permit", "catalogue", "shift", "meta", "audit", "sales", "outbox"], "readwrite");
      const salesRequest = transaction.objectStore("sales").getAll();
      const outboxRequest = transaction.objectStore("outbox").getAll();
      let reads = 0;
      let invalidQueue = false;
      let queueConflict = false;
      const persistPermit = () => {
        reads += 1;
        if (reads !== 2 || invalidQueue) return;
        const sales = salesRequest.result as QueuedOfflineSale[];
        const outbox = outboxRequest.result as OfflineOutboxRecord[];
        const salesById = new Map(sales.map((sale) => [sale.eventId, sale]));
        for (const entry of outbox) {
          if (entry.status === "synced") continue;
          const sale = salesById.get(entry.eventId);
          if (!sale || sale.permitId !== record.permitId || sale.sequence !== entry.sequence) {
            invalidQueue = true;
            queueConflict = true;
            transaction.abort();
            return;
          }
        }
        transaction.objectStore("permit").put(record);
        transaction.objectStore("catalogue").put({
          id: "active",
          snapshotVersion: record.claims.snapshot_version,
          snapshotHash: record.claims.snapshot_hash,
          items: record.snapshot,
          savedAt: record.savedAt,
        });
        transaction.objectStore("shift").put({
          id: "active",
          sessionId: record.claims.session_id,
          registerId: record.claims.register_id,
          cashierId: record.claims.cashier_admin_id,
          permitId: record.permitId,
          expiresAt: record.claims.expires_at,
          savedAt: record.savedAt,
        });
        transaction.objectStore("meta").put({ id: "offline-permit-verified", value: true, verifiedAt: record.savedAt });
        transaction.objectStore("audit").add({
          action: "offline_permit_verified_and_stored",
          permitId: record.permitId,
          snapshotVersion: record.claims.snapshot_version,
          recordedAt: record.savedAt,
        });
      };
      salesRequest.onsuccess = persistPermit;
      outboxRequest.onsuccess = persistPermit;
      salesRequest.onerror = outboxRequest.onerror = () => {
        invalidQueue = true;
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(queueConflict ? new Error("Offline permit cannot replace a permit with unresolved queued sales.") : transaction.error ?? new Error("Verified offline permit could not be stored."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Verified offline permit could not be stored."));
    });
  } finally {
    database.close();
  }
}

export async function readStoredOfflinePermit(): Promise<StoredOfflinePermit | null> {
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["permit"], "readonly");
      const request = transaction.objectStore("permit").get("active");
      request.onsuccess = () => resolve((request.result as StoredOfflinePermit | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Stored offline permit could not be read."));
    });
  } finally {
    database.close();
  }
}

export async function readStoredOfflineSnapshot(): Promise<Array<Record<string, unknown>> | null> {
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["catalogue"], "readonly");
      const request = transaction.objectStore("catalogue").get("active");
      request.onsuccess = () => {
        const record = request.result as { items?: Array<Record<string, unknown>> } | undefined;
        resolve(Array.isArray(record?.items) ? record.items : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Stored offline catalogue could not be read."));
    });
  } finally {
    database.close();
  }
}

export async function readStoredOfflineShift(): Promise<Record<string, unknown> | null> {
  const database = await openOfflinePosDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["shift"], "readonly");
      const request = transaction.objectStore("shift").get("active");
      request.onsuccess = () => resolve((request.result as Record<string, unknown> | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Stored offline shift could not be read."));
    });
  } finally {
    database.close();
  }
}


export async function setOfflineShellReadiness(ready: boolean): Promise<void> {
  const database = await openOfflinePosDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["meta", "audit"], "readwrite");
      const verifiedAt = new Date().toISOString();
      transaction.objectStore("meta").put({ id: "offline-shell-ready", value: ready, verifiedAt });
      transaction.objectStore("audit").add({ action: ready ? "offline_shell_cache_verified" : "offline_shell_cache_not_ready", recordedAt: verifiedAt });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline shell readiness could not be stored."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Offline shell readiness could not be stored."));
    });
  } finally {
    database.close();
  }
}
