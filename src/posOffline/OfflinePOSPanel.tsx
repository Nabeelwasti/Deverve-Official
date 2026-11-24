import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "../adminApi";
import { getOrCreateOfflineDeviceIdentity } from "./deviceCrypto";
import { checkOfflineShellReady, enrollOfflineDevice, fetchAndStoreOfflinePermit, getOfflinePOSStatus, issueOfflinePermit, prepareOfflineShell, syncOfflineQueue } from "./api";
import { listOfflineQueueForPermit, readStoredOfflinePermit, type OfflineQueueSummary } from "./storage";

type Register = { id: string; name: string; location_label: string };
type StockItem = { variant_id: string; product_name: string; sku: string | null; barcode: string | null; size: string; color: string; available_quantity: number };
type Shift = { id: string; register_id: string; status: "open" } | null;
type Device = { id: string; register_id: string; register_name: string; device_label: string; status: string; active_allocations: number; remaining_allocated_units: number };
type Allocation = { id: string; device_id: string; variant_id: string; product_name: string; sku: string | null; size: string; color: string; allocated_quantity: number; consumed_quantity: number; released_quantity: number; status: string };
type ReconciliationCase = { id: string; event_id: string; reason_code: string; opened_at: string; device_id: string; device_sequence: number; outcome: string };

export default function OfflinePOSPanel({
  canManageMoney,
  registers,
  items,
  session,
  onRefresh,
  onSyncComplete,
}: {
  canManageMoney: boolean;
  registers: Register[];
  items: StockItem[];
  session: Shift;
  onRefresh?: () => void;
  onSyncComplete?: () => Promise<void>;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [openCases, setOpenCases] = useState<ReconciliationCase[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("De VERVE POS — Browser");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [durationHours, setDurationHours] = useState("4");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [permitSigningConfigured, setPermitSigningConfigured] = useState(false);
  const [localQueue, setLocalQueue] = useState<OfflineQueueSummary[]>([]);
  const [queueError, setQueueError] = useState("");

  const loadLocalQueue = useCallback(async () => {
    try {
      const permit = await readStoredOfflinePermit();
      if (!permit) {
        setLocalQueue([]);
        setQueueError("");
        return;
      }
      const entries = await listOfflineQueueForPermit(permit.permitId);
      setLocalQueue(entries);
      setQueueError("");
    } catch (caught) {
      setQueueError(caught instanceof Error ? caught.message : "The local offline queue could not be verified.");
    }
  }, []);

  const selectedVariant = items.find((item) => item.variant_id === variantId);
  const remainingForDevice = useMemo(
    () => allocations.filter((item) => item.device_id === deviceId && item.status === "active"),
    [allocations, deviceId],
  );

  const loadDevices = useCallback(async () => {
    if (!canManageMoney) return;
    setLoading(true);
    try {
      const result = await adminRequest<{ devices: Device[]; allocations: Allocation[]; open_cases: ReconciliationCase[] }>("/api/admin/pos/offline/devices");
      setDevices(result.devices ?? []);
      setAllocations(result.allocations ?? []);
      setOpenCases(result.open_cases ?? []);
      setDeviceId((current) => current || result.devices?.[0]?.id || "");
      setMessage("");
      setError(false);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Offline devices could not be loaded.");
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [canManageMoney]);

  useEffect(() => {
    void getOrCreateOfflineDeviceIdentity().then((identity) => {
      if (!canManageMoney) setDeviceId(identity.deviceId);
    }).catch((caught) => {
      setMessage(caught instanceof Error ? caught.message : "This browser cannot create a secure device identity.");
      setError(true);
    });
    void loadDevices();
    void loadLocalQueue();
    void checkOfflineShellReady().then((result) => setShellReady(result.ready)).catch(() => setShellReady(false));
    void getOfflinePOSStatus().then((result) => {
      setCheckoutEnabled(result.checkout_enabled);
      setPermitSigningConfigured(result.permit_signing_configured);
    }).catch(() => {
      setCheckoutEnabled(false);
      setPermitSigningConfigured(false);
    });
  }, [canManageMoney, loadDevices, loadLocalQueue]);

  const runAction = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      setMessage(await action());
      await Promise.all([loadDevices(), loadLocalQueue()]);
      onRefresh?.();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The offline POS action could not be completed.");
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const enroll = () => runAction(async () => {
    if (!registerId) throw new Error("Select a register before enrolling this device.");
    const result = await enrollOfflineDevice(registerId, deviceLabel);
    setDeviceId(result.id);
    return "Device securely enrolled. Stock is not yet allocated and offline checkout is still disabled.";
  });

  const allocate = () => runAction(async () => {
    const units = Number(quantity);
    if (!deviceId || !variantId || !Number.isSafeInteger(units) || units < 1 || units > 20) throw new Error("Choose a device, stock variant and quantity from 1 to 20.");
    if (!selectedVariant || units > selectedVariant.available_quantity) throw new Error("The requested quantity exceeds currently available stock.");
    await adminRequest(`/api/admin/pos/offline/devices/${deviceId}/allocations`, {
      method: "POST",
      body: JSON.stringify({ allocations: [{ variant_id: variantId, quantity: units }] }),
    });
    return "Stock reserved for this device. Online checkout will now respect the reservation.";
  });

  const issuePermit = () => runAction(async () => {
    if (!checkoutEnabled || !permitSigningConfigured) throw new Error("Emergency offline checkout is disabled or permit signing is not configured on this deployment.");
    if (!session || session.status !== "open") throw new Error("Open your own POS shift online before issuing an offline permit.");
    if (!deviceId) throw new Error("This browser has not been enrolled as an offline POS device.");
    await issueOfflinePermit(deviceId, session.id, undefined, Number(durationHours));
    await fetchAndStoreOfflinePermit(deviceId);
    return "Signed permit and catalogue snapshot verified and stored on this device. Emergency checkout remains disabled until final acceptance tests are passed.";
  });

  const prepareCache = () => runAction(async () => {
    const result = await prepareOfflineShell();
    setShellReady(result.ready);
    return `Offline app cache verified: ${result.cached.length} same-origin assets are stored by the service worker.`;
  });

  const sync = () => runAction(async () => {
    if (!deviceId) throw new Error("This browser has no enrolled device identity.");
    if (!navigator.onLine) throw new Error("Reconnect to the internet before syncing. Your local sales remain stored.");
    const result = await syncOfflineQueue(deviceId);
    await onSyncComplete?.();
    return `Sync finished: ${result.accepted} accepted, ${result.needsReview} needing review, ${result.retrying} queued for retry.`;
  });

  const revoke = (id: string) => runAction(async () => {
    const reason = window.prompt("Reason for revoking this offline POS device:");
    if (!reason || reason.trim().length < 3) throw new Error("Enter a clear revocation reason.");
    await adminRequest(`/api/admin/pos/offline/devices/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
    return "Device revoked. Its remaining stock stays reserved until the local queue is reconciled and an owner releases it.";
  });

  const releaseAllocations = (id: string) => runAction(async () => {
    const confirmed = window.confirm("Only continue after you have physically checked this device or recovered its local queue, synchronized every valid offline sale, and manually reconciled any cash/stock discrepancy. Confirm that no unsynced local sale remains?");
    if (!confirmed) throw new Error("Queue reconciliation was not confirmed. Reserved stock remains locked.");
    const reason = window.prompt("Record the owner’s reconciliation/recovery reason (minimum 3 characters):");
    if (!reason || reason.trim().length < 3) throw new Error("A clear reconciliation reason is required.");
    await adminRequest(`/api/admin/pos/offline/devices/${id}/release-allocations`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim(), owner_confirms_device_queue_reconciled: true }),
    });
    return "Owner reconciliation attestation recorded. Unused stock reservations were released and the device permits were marked reconciled.";
  });

  return (
    <div className="pos-grid">
      <section className="pos-card">
        <div className="admin-panel-heading">
          <div><p className="admin-eyebrow">CONTROLLED CONTINUITY</p><h3>Emergency offline POS</h3></div>
          <span className="admin-muted">Offline checkout: disabled</span>
        </div>
        <p className="admin-muted">This area enrolls devices, reserves stock, verifies short-lived cash-only permits and syncs signed queued sales. It does not enable checkout while any release gate remains open.</p>
        <p className="admin-muted">Deployment gate: <strong>{checkoutEnabled ? "Enabled" : "Disabled"}</strong> · Permit signing: <strong>{permitSigningConfigured ? "Configured" : "Not configured"}</strong></p>
        <div className="admin-form-actions">
          <span className={shellReady ? "admin-success" : "admin-muted"}>{shellReady ? "POS shell cache verified" : "POS shell cache not yet verified"}</span>
          <button type="button" className="admin-secondary" disabled={busy} onClick={() => void prepareCache()}>Prepare offline app cache</button>
        </div>
        {message && <p className={error ? "admin-error" : "admin-success"} role="status">{message}</p>}
        {!canManageMoney && (
          <div className="pos-form">
            <p><strong>Current shift:</strong> {session?.status === "open" ? "Open" : "Not open"}</p>
            <label>Permit validity
              <select value={durationHours} onChange={(event) => setDurationHours(event.target.value)}>
                <option value="1">1 hour</option><option value="2">2 hours</option><option value="4">4 hours</option><option value="8">8 hours</option>
              </select>
            </label>
            <div className="admin-form-actions">
              <button type="button" className="admin-primary" disabled={busy || !session || !checkoutEnabled || !permitSigningConfigured} onClick={() => void issuePermit()}>Issue & verify my permit</button>
              <button type="button" className="admin-secondary" disabled={busy} onClick={() => void sync()}>Sync queued sales</button>
            </div>
          </div>
        )}
      </section>

      <section className="pos-card" aria-label="Local offline sales queue">
        <div className="admin-panel-heading">
          <div><h3>Local sale queue & recovery</h3><p className="admin-muted">Durable sale evidence remains on this browser until every event receives a server acknowledgement or owner review.</p></div>
          <button type="button" className="admin-secondary" disabled={busy} onClick={() => void loadLocalQueue()}>Refresh queue</button>
        </div>
        {queueError && <p className="admin-error" role="alert">{queueError}</p>}
        {!queueError && localQueue.length === 0 && <p className="admin-muted">No offline sale events are stored for the active local permit.</p>}
        {localQueue.length > 0 && <div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>Sequence / event</th><th>Recorded</th><th>Items</th><th>Total</th><th>Sync status</th><th>Server receipt</th></tr></thead><tbody>
          {localQueue.map(({sale,outbox,receipt}) => <tr key={sale.eventId}>
            <td><strong>#{sale.sequence}</strong><small>{sale.eventId.slice(0,8)}…</small></td>
            <td>{new Date(sale.createdAt).toLocaleString("en-PK")}</td>
            <td>{sale.lines.reduce((sum,line)=>sum+line.quantity,0)} units<small>{sale.lines.map(line=>line.productName).join(", ").slice(0,100)}</small></td>
            <td>{new Intl.NumberFormat("en-PK",{style:"currency",currency:"PKR"}).format(sale.totalPaisa/100)}</td>
            <td><strong>{outbox.status==="synced"?"Synced":outbox.status==="needs_review"?"Owner review required":outbox.status==="syncing"?"Sync in progress":"Pending sync"}</strong>{receipt?.reasonCode&&<small>{receipt.reasonCode}</small>}</td>
            <td>{receipt?.receiptNumber||"—"}{receipt?.serverReceivedAt&&<small>{new Date(receipt.serverReceivedAt).toLocaleString("en-PK")}</small>}</td>
          </tr>)}
        </tbody></table></div>}
        <p className="admin-muted">Never clear browser data, uninstall the browser, or release this device’s reserved stock while any event is pending, syncing or awaiting owner review.</p>
      </section>

      {canManageMoney && (
        <>
          <section className="pos-card">
            <h3>Enroll this browser device</h3>
            <p className="admin-muted">Enrollment proves possession of a non-extractable P-256 signing key created in this browser. Keep the same browser profile for emergency use.</p>
            <div className="pos-form">
              <label>Register
                <select value={registerId} onChange={(event) => setRegisterId(event.target.value)}>
                  <option value="">Choose register</option>
                  {registers.map((register) => <option key={register.id} value={register.id}>{register.name} — {register.location_label}</option>)}
                </select>
              </label>
              <label>Device label
                <input value={deviceLabel} maxLength={100} onChange={(event) => setDeviceLabel(event.target.value)} />
              </label>
              <button type="button" className="admin-primary" disabled={busy || !registerId} onClick={() => void enroll()}>Securely enroll this device</button>
            </div>
          </section>

          <section className="pos-card">
            <h3>Reserve stock for an enrolled device</h3>
            <p className="admin-muted">Reservations reduce online available stock. They cannot be silently released while a permit is active.</p>
            <div className="pos-form">
              <label>Enrolled device
                <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
                  <option value="">Choose device</option>
                  {devices.filter((device) => device.status === "active").map((device) => <option key={device.id} value={device.id}>{device.device_label} — {device.register_name}</option>)}
                </select>
              </label>
              <label>Product variant
                <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                  <option value="">Choose available stock</option>
                  {items.filter((item) => item.available_quantity > 0).map((item) => <option key={item.variant_id} value={item.variant_id}>{item.product_name} · {item.sku || "No SKU"} · {item.size} · {item.color} · available {item.available_quantity}</option>)}
                </select>
              </label>
              <label>Quantity
                <input type="number" min="1" max={Math.min(20, selectedVariant?.available_quantity ?? 20)} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </label>
              <button type="button" className="admin-primary" disabled={busy || !deviceId || !variantId || loading} onClick={() => void allocate()}>Reserve stock</button>
            </div>
          </section>

          <section className="pos-card">
            <div className="admin-panel-heading"><h3>Enrolled devices</h3><button type="button" className="admin-secondary" disabled={loading || busy} onClick={() => void loadDevices()}>Refresh</button></div>
            {loading ? <p className="admin-muted">Loading devices…</p> : devices.length ? (
              <div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>Device</th><th>Register</th><th>Status</th><th>Reserved units</th><th>Action</th></tr></thead><tbody>
                {devices.map((device) => <tr key={device.id}><td>{device.device_label}<small>{device.id}</small></td><td>{device.register_name}</td><td>{device.status}</td><td>{device.remaining_allocated_units}</td><td>{device.status === "active" && <button type="button" className="admin-danger" disabled={busy} onClick={() => void revoke(device.id)}>Revoke</button>}{device.status === "revoked" && <button type="button" className="admin-secondary" disabled={busy} onClick={() => void releaseAllocations(device.id)}>Confirm queue reconciled & release stock</button>}</td></tr>)}
              </tbody></table></div>
            ) : <p className="admin-muted">No emergency POS devices have been enrolled.</p>}
          </section>

          <section className="pos-card">
            <div className="admin-panel-heading"><div><h3>Offline sales needing review</h3><p className="admin-muted">Conflicts remain open until an owner completes and records the corresponding manual sale, stock and cash reconciliation. They are never silently discarded.</p></div><span className="admin-muted">{openCases.length} open</span></div>
            {openCases.length ? (
              <div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>Event</th><th>Device</th><th>Sequence</th><th>Reason</th><th>Received</th><th>Status</th></tr></thead><tbody>
                {openCases.map((item) => <tr key={item.id}><td><strong>{item.event_id}</strong><small>Case {item.id}</small></td><td>{devices.find((device) => device.id === item.device_id)?.device_label || item.device_id}</td><td>{item.device_sequence}</td><td>{item.reason_code.replace(/_/g, " ")}</td><td>{new Date(item.opened_at).toLocaleString("en-PK")}</td><td><strong>Manual review required</strong></td></tr>)}
              </tbody></table></div>
            ) : <p className="admin-muted">No offline sale conflicts are waiting for review.</p>}
          </section>

          <section className="pos-card">
            <h3>Active stock allocations</h3>
            {remainingForDevice.length ? <div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>Product</th><th>Variant</th><th>Allocated</th><th>Consumed</th><th>Released</th></tr></thead><tbody>
              {remainingForDevice.map((item) => <tr key={item.id}><td>{item.product_name}</td><td>{[item.sku,item.size,item.color].filter(Boolean).join(" · ")}</td><td>{item.allocated_quantity}</td><td>{item.consumed_quantity}</td><td>{item.released_quantity}</td></tr>)}
            </tbody></table></div> : <p className="admin-muted">Choose a device with active allocations to inspect its reserved stock.</p>}
          </section>
        </>
      )}
    </div>
  );
}
