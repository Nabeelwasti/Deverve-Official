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
  const requiredIds = [draft.eventId, draft.idempotencyKey, draft.deviceId, draft.permitId, draft.registerId, draft.sessionId, draft.cashierId, draft.snapshotVersion];
  if (requiredIds.some((value) => typeof value !== "string" || value.length < 8 || value.length > 160)) {
    throw new Error("Offline sale is missing a valid device, permit, shift or event reference.");
  }
  if (draft.currency !== "PKR" || !Number.isSafeInteger(Date.parse(draft.createdAt))) throw new Error("Offline sale currency or timestamp is invalid.");
  if (!Array.isArray(draft.lines) || draft.lines.length < 1 || draft.lines.length > 30) throw new Error("Offline sale must contain between 1 and 30 item lines.");
  for (const line of draft.lines) {
    if (!line.variantId || line.variantId.length > 160 || line.productName.length > 160 || line.sku.length > 100 || line.size.length > 50 || line.color.length > 80) {
      throw new Error("Offline sale contains an invalid product snapshot.");
    }
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
      if (quotaBytes !== null && usageBytes !== null) availableBytes = Math.max(0, quotaBytes - usageBytes);
    }
  } catch {
    reasons.push("Browser storage quota could not be inspected.");
  }
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
    checkoutStorageReady: supported && secureContext && persistentStorageGranted && databaseWritable && (availableBytes === null || availableBytes >= 5 * 1024 * 1024),
    reasons,
  };
}

