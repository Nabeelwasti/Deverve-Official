# De VERVE Offline-First POS — Engineering Design and Acceptance Plan

**Status:** Advanced engineering foundation in draft PR; emergency checkout remains deliberately disabled pending release gates.
**Branch:** `feat/online-first-emergency-pos-completion`
**Date:** 24 November 2026

## Implementation status — 24 November 2026

Implemented on the draft branch; not merged or deployed:

- Additive D1 foundations for device identity, signed permits, stock allocations, immutable event evidence, reconciliation cases/actions and single-use enrollment challenges (migrations `0045`–`0048`).
- Owner/manager device enrollment using a five-minute, single-use challenge and P-256 proof-of-possession; server-side public-key fingerprint verification and bounded challenge attempts.
- Owner/manager device listing/revocation, bounded stock allocation, guarded release and append-only audit evidence.
- Offline allocations reserve the same `product_variants.reserved_quantity` counter used by online checkout.
- Short-lived server-signed permits bind the enrolled device, register, cashier grant, open shift, catalogue snapshot and exact reserved allocations.
- Client-side key integrity checks, challenge signing, permit/snapshot verification, persistent IndexedDB queue, sequential sync leases, retry backoff, durable sync receipts and provisional receipts clearly marked as not official server receipts.
- Restricted live POS fallback: cash-only, walk-in, signed allocated stock only; no offline refunds, voids, shift close or customer contact data. Existing online checkout remains authoritative.
- Service-worker precache/check primitives and explicit cache readiness; API/authentication/mutation requests remain network-only.
- Signed event sync validates device, cashier, permit, payload, sequence, replay, allocation and price; canonical sale, items, payment, financial transaction, inventory movement and audit writes are committed transactionally.
- Exact duplicate sync returns the original canonical sale; conflicting events remain immutable and visible to managers.
- Manager reconciliation endpoint and UI now resolve a conflict only against an existing completed POS sale whose shift, cashier, totals, exact item/variant/price lines, cash tender/change, cash financial ledger and per-variant inventory movements match the immutable offline event. The workflow consumes the matching reserved allocation and records an append-only reconciliation action plus audit log. Mismatches and concurrent changes leave the case open; it does not create compensating sales or silently alter cash/physical stock.

Automated validation currently available:

- CI type-check and production build.
- Worker authorization/translation tests, SQL binding audit, schema/constraint checks, offline storage/service-worker/API guardrails and storefront Playwright suite.
- Final-head CI run `45421372915` passed type-check/build, dependency audit, Worker/auth tests, schema checks, 160 storefront browser tests, 16 remote D1 inventory checks, the complete migration chain `0001`–`0049` on an isolated D1 database, and the production-clone migration rehearsal described below.
- The encrypted backup workflow passed on run `45330719916` attempt 7. It exported production D1, AES-256-GCM encrypted the archive, verified R2 read-back and SHA-256, restored into an isolated D1 database, matched 66 tables, 102 indexes, 10 triggers and all row counts, then confirmed temporary-database deletion.
- CI run `45421372915` also restored the verified backup into a temporary production clone, applied migrations `0045`–`0049`, confirmed existing row counts were unchanged and no new foreign-key violations appeared, verified all seven offline tables and 20 guard triggers, then deleted the clone. No production migration was applied.
- Purchase-cost data is stored in immutable server-only `cost_snapshot_json`; it is excluded from cashier-facing permit claims and catalogue snapshots.

Not yet verified / release blockers:

- No full offline-POS end-to-end browser outage/failure-injection suite against the actual deployed build, and no physical Android acceptance.
- The offline D1 migration chain and production-clone rehearsal passed; owner migration approval and the full offline-sale Worker/API lifecycle acceptance remain outstanding.
- Signing-key generation, secure secret provisioning, rotation/revocation and recovery custody remain owner-controlled tasks.
- Production asset-manifest/cold-reload cache acceptance, preview smoke test and supervised pilot remain outstanding.

**Safety:** The online POS remains authoritative and unchanged. Emergency checkout is deliberately disabled. No production D1 migration or deployment has been made from this branch. Do not merge or enable offline checkout until the owner-controlled signing keypair and backup-key custody are secured, the Cloudflare token is narrowed, physical Android outage/reload/reconnect tests pass, and preview smoke plus supervised pilot approval are complete.  
**Scope:** Existing React/Vite PWA, Cloudflare Pages Functions/Workers, D1, current POS and cashier RBAC.  
**Non-goal:** Replacing the existing POS, changing the accounting model, or making customer checkout work offline.

## 1. Current verified baseline

- `src/POSWorkspace.tsx` loads the live bootstrap endpoint and submits sales directly to `POST /api/admin/pos/sales`. It generates an idempotency key for a normal online sale.
- `src/main.tsx` registers `/sw.js` in production.
- `public/sw.js` caches the app shell and static assets, intentionally bypasses all `/api/` requests, and has no IndexedDB queue or replay handler.
- The POS has registers, sessions, sales, sale items, payments, voids, cashbook and receipt-outbox foundations. Cashier access is separately granted and server-enforced. Cashiers are limited to cash sales, their own shift and their own sale history.
- The current POS is online-only. This design does not claim offline capability exists.

## 2. Product and safety rules

1. Offline mode is a bounded continuity mode for an already authenticated, already-open shift on one owner-enrolled device. It is not a second independent POS database.
2. Only cash tender is eligible offline. Bank transfer, card, wallet, payment links, refunds, voids, cash movements, expenses, stock adjustments, customer-account changes, opening/closing shifts and staff changes remain online-only.
3. A sale is not accepted by the UI until the complete immutable sale event has been committed to IndexedDB in a read-write transaction. If durable storage fails, block the sale and explain why.
4. Offline receipts are explicitly marked **OFFLINE — NOT YET SYNCED** and use a device-scoped temporary reference. They are not presented as a server receipt, tax invoice, or cloud-confirmed sale.
5. A local pending sale is never deleted because of timeout, logout, a failed retry, app restart, or a server rejection. It can only transition to acknowledged, conflict/manual-reconciliation, or an explicitly audited owner resolution.
6. Server validation remains authoritative. Browser values are untrusted, including price, stock, staff identity, device time, sequence counters and cached catalogue.
7. Offline mode must never silently create negative stock, silently change a price, or silently adjust cash already collected.
8. Do not store admin session cookies, passwords, CNICs, payment credentials, full customer records, or secrets in IndexedDB, Cache Storage, localStorage or sessionStorage.

## 3. Connectivity and mode model

Show a persistent, accessible POS status indicator with these distinct states:
- **Online / synced:** API health check succeeded and there is no pending queue.
- **Online / pending sync:** connection exists but one or more events are awaiting acknowledgement.
- **Offline / ready:** the active device has a valid offline permit, cached catalogue snapshot, open-shift snapshot, and sufficient reserved stock allocations.
- **Offline / restricted:** the shell is available but the permit, snapshot, storage, shift or stock allocation is missing/expired. Browsing cached items may be allowed; checkout is disabled.
- **Syncing:** events are being uploaded in stable sequence order.
- **Needs review:** server returned a conflict, expired/revoked permit, unknown outcome, changed product/price, or insufficient reserved allocation. Preserve the sale and show an explicit owner workflow.

Do not trust `navigator.onLine` as proof of Cloudflare availability. It is only a hint. Use a bounded same-origin API health probe with timeout and classify HTTP 5xx, timeout and network errors as unavailable. Do not continuously hammer the API. Resume sync on page visibility, application startup, an `online` hint, explicit user retry, and Background Sync where supported.

## 4. Device enrollment and offline permit

Add an owner-only device enrollment workflow:
- Create a random device identifier and a device key pair with Web Crypto. Persist the non-extractable private `CryptoKey` in IndexedDB and register the public key server-side.
- Bind the device to one register, one business, and a cashier capability. Revoke devices independently of staff accounts.
- On a successful online bootstrap, issue a short-lived signed offline permit containing device ID, register ID, staff ID, cashier grant/version, shift ID, snapshot version, allowed payment method (cash only), permitted SKU/variant allocation IDs and quantities, maximum queued event count, issue/expiry timestamps and policy version.
- The permit must be signed server-side and verified client-side against a pinned public verification key. Never embed a signing secret in the browser.
- The permit is a bounded authorization lease, not a way to bypass server authorization. Revocation cannot reach an offline device immediately; therefore offline access is limited to one enrolled physical device, short leases, strict cash-only scope and low stock quotas. On reconnect, server revocation and lease status always win.
- Do not persist or replay the admin session cookie. A separate local device unlock (short PIN/passphrase-derived key, rate-limited local lockout) may unlock the local queue. It is not a substitute for server login and cannot extend the server-issued permit.
- Browser storage and local device clocks are not tamper-proof. Record local time as evidence only, never as authoritative proof of sale time. Any event outside policy or with unverifiable permit/signature is routed to manual reconciliation.

## 5. Inventory safety: reserved offline allocations

Do not rely on a cached stock number. Offline sales on multiple devices otherwise oversell inventory.

Introduce explicit server-owned per-device allocations:
- When online, the owner/manager allocates a conservative quantity per variant to one enrolled device and register.
- Allocation creation must atomically verify active product/variant, current available stock, register/device ownership and cashier authorization, then increase the existing reserved quantity and write an allocation ledger/audit event.
- Online website checkout and other POS devices must continue to see the allocated units as unavailable. The existing available-stock formula `stock_on_hand - reserved_quantity` must remain the central guard.
- When an offline sale syncs, the server atomically decreases both physical stock and that device's remaining allocation by the accepted quantity, so the global available quantity is not changed a second time.
- Unused allocation is released only after the device has synced and the owner confirms its queue is complete, or through a documented device-recovery procedure. Never auto-release merely because a timer elapsed: a device may contain unuploaded cash sales.
- Device allocations must be small, explicit and visible in System Health. The default is no offline allocation until an owner sets a policy. Never allocate more than the verified available quantity.
- Duplicate variant lines are aggregated before local validation and again on the server.

## 6. Local data model (IndexedDB)

Use a versioned database, not localStorage:
- `device`: device ID, register ID, schema version, enrollment status, public/private CryptoKey references and last successful server handshake.
- `permit`: signed permit bytes, verified policy claims, issue/expiry and revocation state last observed online.
- `catalogue_snapshots`: minimal POS projection only (variant ID, SKU/barcode, product/variant display labels, retail price in paisa, active flag, snapshot/version ID, server-issued allocated quantity). No cost price, customer PII or unnecessary product content.
- `shift_snapshot`: register/session IDs, opening cash, cashier identity, grant version and permit reference. It is read-only offline; no offline open/close.
- `sales_outbox`: immutable event ID, idempotency key, device sequence, permit ID, register/session IDs, cashier ID, snapshot version, currency, item/price/tax/discount snapshots, cash tendered/change, payload hash, local timestamp (advisory), status, retry count and last error code.
- `sync_receipts`: server response, canonical sale ID/receipt number, accepted/rejected/conflict status and server timestamp.
- `audit_local`: append-only local actions (sale queued, retry, conflict viewed, manual resolution requested). No secrets or raw customer data.

Create each sale and its queue entry in one IndexedDB transaction. Use a unique key on the event/idempotency key. Request persistent storage with `navigator.storage.persist()`; report the result and quota estimate. Persistent storage is not guaranteed, so block checkout when storage cannot safely commit and keep a prominent unsynced count.

Use a single-writer strategy across tabs (Web Locks where supported plus an IndexedDB lease/transaction guard); detect duplicate open POS tabs and prevent sequence races. Background Sync is an optimization only. The page must retry on foreground/startup because browser support and scheduling are not universal.

## 7. Sync API contract

Add a dedicated authenticated endpoint, not generic background replay of arbitrary `/api/admin/*` requests:

`POST /api/admin/pos/offline-sync`

Request: bounded batch (for example, at most 10–20 events), device ID, permit ID, snapshot version, monotonic per-device sequence, each immutable sale payload, payload hash and device signature. Enforce body-size and item-count limits.

Server must:
1. Authenticate the current staff session and re-check active cashier grant, device registration/revocation, register, shift and permit policy.
2. Verify device signature, canonical payload hash, event schema, sequence uniqueness, cash-only payment, positive integer quantities, integer paisa amounts and bounded timestamps.
3. Use a unique server constraint for `(device_id, offline_event_id)` and/or the idempotency key. Same key + same payload returns the original result; same key + different payload is a hard conflict/security event.
4. Recompute totals from the server-authoritative price snapshot and compare the recorded price/version. Do not silently overwrite a price that was shown to the customer.
5. Check the device's reserved stock allocation for every aggregated variant line. No stock outside the allocation may be accepted automatically.
6. Write POS sale, items, cash payment, inventory movements, financial ledger, audit event and receipt outbox in one D1 batch/transaction. Use prepared statements and verify the expected affected-row counts.
7. Return one result per event: accepted with canonical sale/receipt identifiers; already accepted (idempotent replay); rejected with a stable machine-readable reason; or conflict/manual review. Never return a generic success for an event that was not committed.
8. Preserve order of device sequence and avoid processing later events past an unresolved earlier sequence unless the server explicitly records a safe skip/reconciliation decision.

D1 `batch()` provides sequential transactional execution and rolls back the batch when a statement fails. Use that property for each individual sale, not a multi-sale mega-batch whose failure obscures per-sale outcomes. Add database uniqueness constraints as the final duplicate guard.

## 8. Reconciliation and conflict handling

- **Unknown network outcome:** retry the exact same event and idempotency key. Never create a new key because a request timed out.
- **Duplicate replay:** return the original canonical sale and do not write stock, payment, ledger, receipt or audit side effects again.
- **Price changed:** keep the local sale and amount; do not auto-adjust it. Flag owner review and record a variance/override only through an audited server-side action.
- **Product archived/variant disabled:** preserve the event; owner review decides whether to accept the historical sale or record a compensating correction.
- **Stock allocation exhausted or invalid:** preserve cash evidence; create a conflict case. Do not decrement other stock or silently mark accepted.
- **Cashier/device/permit revoked or shift closed online:** do not silently accept; preserve and route to owner review with the exact reason.
- **Device lost/damaged:** owner revokes it online, records physical cash/receipt reconciliation and follows the documented recovery procedure. Never delete its server allocation while queue state is unknown.
- **Manual resolution:** the manager must supply an existing completed POS sale ID and an explanation. The server compares the immutable event with the canonical sale shift/cashier/totals, every item/variant/price, cash payment tender/change, financial ledger entry and exact per-variant inventory movements. Only an exact match can atomically consume the corresponding offline allocation, set the event to accepted, resolve the case, and append an action plus audit record. No sale is fabricated and no cash or physical-stock adjustment is invented by this workflow. Any mismatch or concurrency failure leaves the case open.

## 9. UI and cashier workflow

- Add a persistent online/offline/pending/conflict indicator and queue count in the POS header and mobile layout.
- Add a dedicated **Offline sales** panel showing queued, syncing, accepted, needs-review counts; event references; last sync; device/register; allocation remaining; permit expiry; storage health.
- On offline checkout, allow cash only, enforce allocated quantities, calculate price from the cached signed snapshot, save atomically, then show a printable temporary offline receipt with explicit pending status.
- Never show online reports, balances, cashbook, expense totals, refunds, or complete sale history as if current while offline. Label cached values with their last server sync time.
- Do not allow offline shift close. At reconnect, sync first, fetch authoritative totals, then permit normal online close/reconciliation.
- On logout/account switch, do not erase unsynced events. Lock the local workspace and require owner/cashier reconciliation; clear catalogue and sensitive cached state only after queue is safely acknowledged or exported under an approved encrypted recovery process.
- If the device storage is cleared, there is no guarantee of recovery. This limitation must be shown to the owner and addressed operationally (single dedicated device, no private/incognito mode, storage persistence, daily sync and physical cash/receipt closeout).

## 10. Service worker and PWA rules

- Continue cache-first/network-first strategies only for versioned static shell assets and safe public static resources.
- Never cache admin API responses, session endpoints, POS bootstrap responses, personal/customer data, financial reports, private media or mutation responses in Cache Storage.
- Add offline route fallback only after the shell is verified complete. Keep `/api/` network-only.
- Background Sync may wake the sync runner, but the IndexedDB outbox is the source of truth. Add foreground retry fallback and exponential backoff with jitter. Respect `Retry-After`; do not retry permanent 4xx validation/authorization errors indefinitely.
- Version the shell and IndexedDB schema. Upgrade without deleting pending events. Block activation of an incompatible worker until pending data is migrated safely or the user has reconciled it.
- Test update while offline, interrupted upgrade, old tab/new worker, and rollback.

## 11. Proposed schema additions (migration review required)

Names are provisional; inspect the live D1 schema and current POS route before writing SQL:
- `pos_offline_devices`: device ID, public key, register ID, owner enrollment, status, created/revoked timestamps, last seen.
- `pos_offline_permits`: permit ID, device, cashier, grant version, session, snapshot version, signed claims, issued/expiry, revocation and policy version.
- `pos_offline_stock_allocations`: device/permit/variant, allocated, consumed, released, status and audit timestamps; unique active allocation scope.
- `pos_offline_events`: device/event ID, idempotency key, payload hash, sequence, canonical sale ID, outcome, reason code, server received/processed times; unique device/event and idempotency constraints.
- `pos_offline_reconciliation`: immutable review cases and append-only resolution records.

Do not add a migration until current `pos_sales`, `pos_sale_items`, `pos_payments`, `pos_sessions`, `inventory_movements`, `financial_transactions`, `audit_logs`, cashier grant and receipt-outbox constraints have been read from the actual production schema and local test schema. No production migration is authorized by this design document.

## 12. Test plan — required before enabling

### Unit and database tests
- IndexedDB transaction atomicity: sale and outbox both commit or neither commits.
- Same idempotency key/same payload; same key/different payload; duplicate device sequence; concurrent tab submissions.
- Signature tamper, permit tamper, expired permit, wrong device/register/session/cashier, revoked grant, revoked device.
- Cash-only allowlist; reject card/bank/wallet/QR/payment link, refunds, voids, cash movement and shift open/close.
- Aggregated duplicate SKU lines, fractional/negative/huge quantities, paisa overflow, malformed JSON and oversized payload.
- Stock allocation create/consume/release, two devices competing for final units, concurrent online checkout vs offline allocation, online sale while device offline, exact one-time release and rollback on any failed D1 statement.
- Replay after timeout, Worker crash mid-sync, response lost after server commit, duplicate batch, partial batch acceptance, retry-after and permanent errors.
- Price changed, product archived, variant disabled, stock allocation insufficient, permit expired and session closed.
- Reconciliation and audit immutability; receipt outbox only once.

### Browser and physical-device tests
- Android Chrome installed PWA: airplane mode before opening; airplane mode after login; reload offline; close/reopen browser; device restart; screen lock; app update while pending; low storage; storage denied; private browsing detection.
- Cloudflare/API 5xx while internet remains on; captive portal; flaky 2G/3G; DNS failure; TLS failure; repeated network flaps.
- Camera/barcode scanning offline using cached catalogue; manual SKU; duplicate scan; cart edits; cash tender/change; print/temporary receipt.
- Two tabs, two devices, owner revoke while one device offline, cashier logout, cashier account switch and device loss.
- Sync after reconnect with duplicate and out-of-order events; verify stock, payment, ledger, audit, receipt and shift totals all reconcile exactly.
- Actual Android browser versions and actual 58mm/80mm printer models used by the business. Desktop simulation alone is insufficient.

### Release gates
1. Reviewed code, migrations and threat model.
2. Type-check, production build, dependency/security audit, Worker tests, schema tests, Playwright desktop/mobile and dedicated D1 integration tests all pass.
3. Isolated D1 concurrency/rollback suite passes with dedicated non-production credentials.
4. Physical Android pilot on one owner-enrolled device passes the complete test matrix.
5. Owner approves offline stock allocations, max offline duration, cash-only rules, local device custody and manual conflict procedure.
6. Controlled preview deployment and smoke test pass.
7. Production migration is applied only after backup and read-back; controlled Pages deployment is verified.
8. Enable offline checkout for one designated device only; monitor first supervised shift and reconcile every event before expanding.
9. Do not mark offline POS production-accepted until all above evidence is recorded.

## 13. Operational policy defaults for pilot

- One designated Android device and one register only.
- Cash-only offline sales.
- Existing open shift only; no offline shift open/close.
- Short server-issued permit (target 4–8 hours, final duration owner-approved).
- Conservative per-SKU stock allocations; zero allocation by default.
- Small bounded queue and batch size; block new offline checkout before storage/queue limits.
- Daily supervised sync and cash reconciliation; never leave pending sales overnight without owner review.
- No offline customer account, refunds, voids, returns, rentals, wholesale quotations, payment links, expense or cashbook operations.

These are proposed defaults, not active production settings.

## 14. Research and standards

- MDN, Offline and background operation: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation
- MDN, Background Synchronization API (limited browser availability): https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- MDN, IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology
- MDN, storage quotas and persistent storage: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Chrome Workbox Background Sync and fallback behavior: https://developer.chrome.com/docs/workbox/modules/workbox-background-sync/
- Cloudflare D1 database API and transactional `batch()`: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare D1 limits/concurrency: https://developers.cloudflare.com/d1/platform/limits/
- OWASP HTML5 Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- OWASP Web Security Testing Guide — Browser Storage: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side/11-Browser_Storage/

**Key research conclusions:** Background Sync is not universally supported and must not be the only retry mechanism. Browser storage is best-effort unless persistence is granted and still remains user/device-controlled. IndexedDB is appropriate for structured offline queues, but it is not a trusted server. D1 batch operations provide transactional rollback for grouped statements. Offline inventory requires server-issued stock allocations; a stale cached stock number is not enough.
