# De VERVE Emergency Offline POS — Research Review

**Reviewed:** 24 November 2026  
**Baseline:** merged `main` commit `3620ea9e7c8561abf947ba6697b5ad0b6937bed0`  
**Status:** implementation design review; no offline checkout enabled

## Executive decision

Use a **local-first PWA outbox backed by IndexedDB** as the first emergency-continuity implementation, with Cloudflare D1 remaining the authoritative ledger. Do not use RAM, `localStorage`, `sessionStorage`, or Cache Storage as the sales database. Add a native Android companion (Room + Android Keystore) only if the physical pilot demonstrates that browser-origin storage, kiosk controls, printer integration, or recovery guarantees are insufficient.

This is deliberately a bounded continuity mode, not a second independent accounting system.

## Comparison of storage and execution options

| Option | What it is good for | Important weakness | Decision |
|---|---|---|---|
| JavaScript/device RAM | Current cart and transient UI state | Lost on process kill, tab close, browser reclaim, or device restart | Never the source of truth for a sale |
| `sessionStorage` | Temporary tab state | Cleared when the tab/session ends; small string-only storage | Not suitable |
| `localStorage` | Small preferences and flags | Synchronous, string-only, easy for same-origin scripts to read/change; not transactional; OWASP warns against secrets/session IDs | Not suitable for sale records or credentials |
| Cache Storage + service worker | Offline HTML, JS, CSS, icons and safe static resources | Request/response cache, not a transactional business database; API response caching creates privacy and stale-data risks | App shell only; all admin/POS APIs stay network-only |
| IndexedDB | Structured records, indexes, atomic read/write transactions, usable by page and service worker | Browser-controlled quota/eviction; user can clear site data; same-origin XSS can read/change records; not a server authority | Preferred PWA emergency outbox, with strict storage-health gate |
| OPFS / SQLite WASM | File-oriented local database and richer SQL queries | Browser storage remains quota/eviction-controlled; additional engine and migration complexity | Not needed for this small bounded outbox; reconsider only with measured need |
| Native Android Room + Android Keystore | App-private database, Android app sandbox, device-keystore-backed keys and stronger kiosk/device integration | Requires a maintained native app, signing/release pipeline and device lifecycle; still cannot survive every uninstall, reset, hardware loss or compromise | Phase-two hardening option, not a prerequisite for the PWA pilot |
| Local LAN server / second POS terminal | Can serve multiple local terminals during WAN outage | Adds hardware, power, LAN, local backup and split-brain failure modes; unnecessary for one emergency device | Do not introduce for the first pilot |

## What “device memory” should mean

There are three very different things:

1. **RAM** is temporary working memory. It is never trusted for committed sales.
2. **Browser persistent storage** is disk-backed origin storage such as IndexedDB. It can survive reloads and restarts, but browsers or users can still remove it.
3. **Android app-private storage** is available to a native application and can be protected with Android's application sandbox and Android Keystore. It offers stronger device integration, but it is a separate application architecture.

For the current React/Vite PWA, IndexedDB is the practical and correct first layer. Request `navigator.storage.persist()`, inspect `navigator.storage.estimate()`, handle quota errors, and show whether persistence was actually granted. Persistent storage reduces browser eviction risk; it is not a backup and does not protect against the user clearing site data, device loss, root compromise, or malicious same-origin script.

## Revised emergency architecture

### A. Local device layer

- One owner-enrolled Android device, one POS register, one active cashier/owner grant.
- A versioned IndexedDB database for device metadata, signed permit, minimal catalogue/price snapshot, shift snapshot, immutable sale events, sync receipts and append-only local audit.
- Each checkout and its outbox record must commit in one IndexedDB read/write transaction before the UI says **Sale saved locally**.
- Require persistent-storage approval, adequate free quota, a healthy database open/read/write probe, valid device key, valid signed permit and a current-enough catalogue/shift snapshot before enabling offline checkout.
- No passwords, admin cookies/session IDs, CNIC, full customer profiles, card credentials, cost prices or secret API keys in browser storage.
- Store only walk-in customer data for the first pilot. Customer identity/phone/email capture remains online-only.
- Use Web Crypto for device signatures and integrity checks. Non-extractable browser keys are useful, but are not hardware-backed guarantees and do not defeat XSS. Treat every local record as untrusted on read.
- Single writer per device: Web Locks where available plus an IndexedDB transaction/lease fallback. Detect competing tabs.
- A printed receipt must say **OFFLINE — NOT YET SYNCED**, carry a device-scoped temporary reference and must not look like a cloud-issued/tax receipt.

### B. Cloud-authority layer

- Cloudflare D1 remains the only canonical sales, inventory, payment, financial-ledger, audit and receipt authority.
- Owner/manager pre-allocates conservative quantities by SKU/variant to the enrolled device. Allocated units are removed from online-available stock before an outage.
- No offline allocation by default. No multi-device offline stock pools in the first release.
- A short server-signed permit binds device, register, staff/cashier grant version, already-open shift, catalogue snapshot, cash-only scope, exact stock allocations, maximum queue size and expiry.
- Local clock is advisory. The server checks permit validity, revocation/grant status, sequence, signature, allocation and payload hash when events arrive.
- Each accepted sale is processed in its own D1 transactional batch with uniqueness constraints. Same event ID + same payload returns the original result; same ID + different payload is a hard security conflict.
- Sale, sale items, cash payment, inventory movement, allocation consumption, financial transaction, audit record, event result and receipt outbox must be atomic. A failed statement must roll back the sale.
- Preserve all rejected, expired, ambiguous and unknown-outcome events for owner reconciliation. Never delete or silently edit local cash-sale evidence.

### C. Connectivity and retry layer

- `navigator.onLine` is only a hint. Use a bounded same-origin health request and distinguish internet availability from Cloudflare/API availability.
- The service worker caches only versioned static shell resources. Admin and POS APIs remain network-only.
- The IndexedDB outbox is the source of truth. Background Sync is optional acceleration only because browser support and scheduling are not universal.
- Retry on app startup, foreground/visibility, an online event, and a cashier/owner retry action; use exponential backoff with jitter and respect `Retry-After`.
- Retry an unknown network outcome with the exact same event ID and payload. Never mint a new key after a timeout.
- Sync in device-sequence order; show accepted, pending, conflict and needs-review counts. Never show cached financial totals as live.

## Conservative pilot policy

- One dedicated Android device and one register.
- One already-open online shift; no offline shift opening or closing.
- Cash-only; walk-in customer only.
- Target permit lifetime: 4 hours, server-issued, not extendable offline.
- Small owner-approved SKU allocations; no allocations until stock and register are reviewed.
- Hard cap: 20 queued sale events per permit; each event limited to 30 lines and bounded quantities/amounts.
- No refunds, voids, returns, exchanges, expenses, cash movements, account changes, rentals, wholesale credit, payment links, card/bank/wallet/QR, staff changes or inventory edits offline.
- At reconnect, sync and reconcile before allowing shift close or releasing unused allocation.
- Daily supervised sync and physical cash/receipt reconciliation. Do not leave unsynced sales overnight.
- If storage persistence is denied, quota is low, DB write fails, device key is missing, permit expires, or local data integrity check fails: **offline checkout is disabled**. Never fall back to RAM or localStorage.

These defaults are implementation safeguards, not a claim that offline mode is active or owner-approved for production.

## Required release evidence

1. Review the production D1 schema and repository migrations without changing live records.
2. Add additive schema migration and isolated test database coverage; no production migration until backup/export and owner-approved deployment.
3. Implement device enrollment, signed permit issuance/verification, allocation ledger and revocation.
4. Implement IndexedDB schema, atomic queue, immutable event hashing/signing, storage-health UI and safe receipt.
5. Implement a dedicated bounded sync endpoint with server-side RBAC, uniqueness, D1 atomicity and reconciliation.
6. Add unit, property, race, API, browser, service-worker update and rollback tests.
7. Test on the actual dedicated Android device: airplane mode, Cloudflare 5xx with internet still up, DNS/TLS outage, tab/app kill, browser restart, Android reboot, low storage, storage denied, update while pending, duplicate retry, concurrent tabs, printer and cash close.
8. Verify stock, sale, payment, ledger, audit and receipt exactly once after sync.
9. Enable one supervised device only after all gates pass. Production deployment and production enablement are separate approvals.

## Research sources

- MDN — [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): best-effort vs persistent storage, quota and eviction, `persist()` and `estimate()`.
- MDN — [Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB): transaction and lifecycle considerations.
- Microsoft Edge — [Store data on the device](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/offline): IndexedDB for structured PWA data; cache for resources.
- MDN — [Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API): limited availability; optional retry mechanism only.
- MDN — [Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation): service-worker lifecycle and background operation.
- OWASP — [HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html): do not store session identifiers/secrets in web storage; IndexedDB is not confidentiality against local access/XSS.
- OWASP — [Browser Storage Testing](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side/11-Browser_Storage/): audit token retention, sensitive data and key handling.
- Android Developers — [Sensitive data in external storage](https://developer.android.com/privacy-and-security/risks/sensitive-data-external-storage): app sandbox, encryption and Android Keystore.
- Cloudflare — [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/): `batch()` runs statements sequentially and rolls back the batch on statement failure.

## Final conclusion

The strongest practical first release is a **PWA + IndexedDB emergency outbox + signed short-lived permit + server-reserved stock + transactional D1 reconciliation**. Device RAM is never used as storage. Native Android Room/Keystore remains the stronger next step if browser storage and device management fail the real-device acceptance tests.