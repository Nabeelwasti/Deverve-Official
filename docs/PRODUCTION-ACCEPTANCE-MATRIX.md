# Production acceptance matrix

**Last reviewed:** 23 November 2026  
**Production:** https://deverve-official.pages.dev  
**Repository:** https://github.com/Nabeelwasti/Deverve-Official

**Release rule:** A passing build is necessary, not sufficient. Mark an operational capability accepted only after the evidence listed below exists.

## Verified application foundations

| Capability | Verified foundation | Acceptance status |
|---|---|---|
| POS cashier RBAC | PR #34 merged; separate revocable grant and invite tables; server-side deny-by-default route boundary; cash-only sale guard; own-shift and own-sale scoping; atomic shift close. Production D1 migration 0040 applied; Pages deployment `ea1ed48c-32ba-40e4-9310-ded65b4b134f` includes the code. | Code and schema deployed; zero cashier grants exist. Owner-operated invitation, live authenticated cashier workflow and physical shift/device acceptance still pending |
| Owner system health | PR #35 merged; owner-only endpoint and workspace report D1, outbox queues, payment counts, stock anomalies, POS shifts, staff/cashier counts and provider configuration without returning secret values. Deployment `ea1ed48c-32ba-40e4-9310-ded65b4b134f` succeeded; unauthenticated route check returns 401. | Code deployed; owner login/dashboard review pending. Provider delivery, Turnstile and backup/restore are explicitly not considered verified by configuration telemetry |
| CMS homepage | Migrations 0041–0043 published the `home` page with seven sections, four FAQs, five navigation items and three verified category artworks; PR #38 deployed category-image save validation, public media authorization and archive protection. PR #39 restored the shared responsive storefront header, hamburger drawer, product/category/vehicle/page search, shared golden quote feed/fallback, branded footer and bottom credit strip. Production mobile render returned HTTP 200 with all restored elements present. | Published and rendered; 158 desktop/mobile browser tests passed; owner content review and final merchandising/copy approval remain pending |
| CMS homepage chrome and discovery | PR #39 shares the existing quote fallback/rotation module, restores the storefront hamburger drawer, adds search over products/categories/vehicles/navigation, and restores the branded footer plus separate bottom strip. Desktop/mobile E2E verifies drawer open/close, fashion/rental search destinations, quote display, footer and zero horizontal overflow; production mobile render confirms the elements are present. | Deployed; 158 browser tests passed and live mobile smoke returned HTTP 200 |

| Capability | Verified foundation | Acceptance status |
|---|---|---|
| Cloudflare Pages | Latest production deployment `bea6a0c6-8f3c-49d4-aa9e-2c1037bf6656` from `main` commit `46c68c94ce2b689dbff00b863259e32a458025e3` completed all five stages. PR #39 CI run `45149470914` passed all 17 steps and 158 browser tests. Production mobile browser render returned HTTP 200 and confirmed search, quote strip, hamburger, CMS content and footer strip. | Deployed and targeted homepage smoke passed; broader protected-route, provider and operational acceptance remains outstanding |
| D1 commerce schema | Live database contains products, variants, orders, inventory movements, reservations, POS, payments, webhook events and audit tables | Schema exists; integration tests outstanding |
| Public catalogue API | Live `/api/products` returned 3 published products; a response inspection confirmed no `cost_price_paisa` field on products or variants | Targeted public-data check passed; owner catalogue/authenticity reconciliation remains outstanding |
| Catalogue indexes | Production D1 contains `idx_product_variants_sku_nocase` and `idx_pos_sales_status_created`; migration 0039 is applied and query plans were verified against the live database | Applied and query-plan verified; sustained workload/concurrency acceptance remains outstanding |
| POS | Registers, sessions, sales, sale items, payments, voids, cashbook and receipt outbox exist | Online workflows implemented; owner reconciliation and device acceptance outstanding |
| Shared stock | Inventory movement and order reservation ledgers exist. An isolated APAC D1 race test ran a website reservation and a two-line POS sale concurrently against the same five units: exactly one won; the winning POS batch committed two stock movements, payment, financial ledger, audit and receipt outbox consistently, with no orphan records. The temporary test database was deleted and its absence verified. | D1 batch concurrency behavior verified; full Worker/API remote integration and sustained production-like load testing remain outstanding |
| Payments | Payment attempts and webhook-event foundations exist | COD active; live provider acceptance outstanding |
| Turnstile | The live verifier health endpoint returned `status=ok`, `secret_configured=true` and the expected `deverve-official.pages.dev` hostname on 23 November 2026 | Verifier configuration/health confirmed; invalid-token Siteverify negative test and end-to-end public form acceptance remain outstanding |
| Email / WhatsApp | Outbox and retry logic exist | Provider credentials, consent and delivery acceptance outstanding |
| PWA | Manifest and service worker cache the shell and static assets | Installable shell; not an offline-first POS |
| Encrypted D1 backup | AES-256-GCM export/restore workflow; successful run `45330719916` attempt 7 on 24 November. Private R2 object read-back and SHA-256 passed; isolated restore matched 66 tables, 102 indexes, 10 triggers and all row counts; temporary D1 database deletion was confirmed. | Backup and restore drill passed; least-privilege token scope, independent password-manager key custody, off-account copy and retention/RPO/RTO remain pending |

## Release blockers and owner-controlled prerequisites

### 1. Encrypted backups and recovery

The repository workflow .github/workflows/d1-backup-restore.yml is scheduled daily at 02:00 Pakistan Standard Time (21:00 UTC). It is not operationally active until all required GitHub Actions secrets are configured and a full run succeeds:

- CLOUDFLARE_API_TOKEN: D1 Write plus Workers R2 Storage Bucket Item Write scoped only to `deverve-db-backups` (object read/write/list); this permits the export, temporary restore-database lifecycle and encrypted-object read-back without broad account-wide R2 administration.
- CLOUDFLARE_ACCOUNT_ID.
- D1_BACKUP_ENCRYPTION_KEY: 32 random bytes encoded as 64 hex characters. Generate offline with openssl rand -hex 32; store in an owner-controlled password manager, never in the repository or backup bucket.
- Confirm private bucket deverve-db-backups exists and token permissions are sufficient.

Required evidence: encrypted production snapshot, SHA-256 integrity check, successful decrypt and restore into an isolated non-production D1 database, row-count/schema comparison, confirmed deletion of the isolated database, retention verification and a documented recovery exercise. The restore script now exits unsuccessfully if temporary database deletion cannot be confirmed (PR #33). A green syntax check is not a backup. A successful upload is not a restore test.

The scheduled workflow performs the isolated restore drill too. Monitor its Actions history and configure failure notifications. No backup is guaranteed until the first successful run is observed. Keep the encryption key independently from the R2 bucket.

### 2. Offline-first POS

The current service worker intentionally excludes API requests and the POS uses live admin API calls. The current POS is not offline-first. Do not enable offline sales by caching /api/admin/pos/* or by replaying arbitrary requests to the existing online-sale route.

The implementation contract is maintained in [OFFLINE-FIRST-POS-ENGINEERING-DESIGN.md](OFFLINE-FIRST-POS-ENGINEERING-DESIGN.md). That design is the detailed source of truth for the client queue, device permits, stock allocations, sync API, conflict handling and acceptance tests.

Required implementation and acceptance:
- Use versioned IndexedDB as the durable outbox; commit the complete immutable sale and queue record atomically before showing a local sale as recorded. Fail closed if storage cannot commit. Request persistent storage but do not assume it is guaranteed.
- Keep the service worker limited to the public app shell and safe static assets. Keep all /api/ routes network-only; never cache authenticated POS bootstrap, reports, sessions, customer data or mutation responses.
- Enroll one owner-approved physical device per register with a device key pair and short-lived server-signed permit. Do not store or replay admin passwords/session cookies. Device revocation and cashier permission must be rechecked on reconnect.
- Allow cash-only offline sales against an already-open online shift. No offline session open/close, refunds, voids, expenses, cash movements, account changes, inventory adjustments, bank/card/wallet payments, customer-account changes or other privileged operations.
- Reserve stock centrally for each device before offline operation. Online channels and other registers must not consume that allocation. Never rely only on a stale cached stock count and never auto-release an allocation while unsynced events may exist.
- Sync only through a dedicated authenticated offline-sync endpoint. Enforce event/device uniqueness, stable idempotency keys, payload hashes, device signatures, sequence ordering, current authorization and shift policy, authoritative price snapshots, allocation limits and atomic per-sale D1 writes for sale, items, cash payment, stock, ledger, audit and receipt records.
- Same event/key and same payload must return its original result without repeating business effects. Same key with a different payload is a hard conflict. Unknown network outcomes retry the exact same event and key.
- Preserve every queued event after timeout, logout, restart, permission change, validation failure or conflict. Do not silently alter prices, stock or cash already collected. Route ambiguous/rejected cases to an audited owner reconciliation process.
- Show explicit OFFLINE — NOT YET SYNCED receipt status, pending/syncing/accepted/conflict counts, last successful sync, permit expiry, allocation remaining and storage health. Do not present cached financial reports as current.
- Test airplane-mode checkout/reload, app/browser termination, low or denied storage, multiple tabs, duplicate replay, same-key/different-payload conflict, lost response after server commit, device revocation, expired permit, changed prices, disabled products, stock allocation exhaustion, concurrent online sales, D1 rollback and real Android scanner/printer behavior.

Until the implementation, automated tests, remote D1 acceptance and supervised physical Android acceptance all pass, use online POS only and do not advertise offline sales as supported.

### 3. POS cashier RBAC — implemented and deployed; operational acceptance pending

PR #34 adds a separate cashier capability grant and invite marker without changing the legacy admin role CHECK constraints. The production migration 0040 is applied. Cashier access is restricted server-side to the POS workspace, cash-only sales, own shift open/close and own sale history. Other admin APIs, refunds/voids, cash movements, expenses, finance reports, bulk exports, catalogue, inventory, staff and configuration are denied. Permission changes revoke active sessions; shift close and reconciliation are atomic.

No cashier grant currently exists in production. Owner must invite the intended cashier, verify the account and role, then complete a supervised real-device shift, cash reconciliation, receipt and revocation test before enabling operational use.

### 4. Inventory and accounting

- Add remote D1 integration tests with dedicated least-privilege test credentials.
- Run concurrent checkout/POS sales against the same variant and prove no oversell.
- Prove reservations are released/consumed exactly once across payment success/failure, cancellation, dispatch and webhook replay.
- Reconcile physical counts, SKU/barcodes, costs and size/colour variants with the owner before trusting valuation and gross-profit reports.
- Validate daily CSV exports against POS, online orders, cashbook, refunds and expenses.

### 5. Payments and external services

- COD is the active customer checkout method. Do not accept card data in the application.
- Complete a provider adapter only after provider account approval, hosted checkout, signed webhook verification, replay protection, amount/currency/order matching, refund/reconciliation and controlled live acceptance.
- Turnstile requires valid site/secret keys and real form acceptance. Fail closed on verification errors for protected public submissions.
- Resend and WhatsApp delivery require verified sender/template configuration, customer consent, retry/duplicate tests and provider status monitoring.
- Courier integrations require business credentials, sandbox/live acceptance and tracking reconciliation.

### 6. System health and telemetry

The owner-only System Health dashboard is implemented in PR #35 and deployed in production. Its read-only endpoint is protected (unauthenticated requests return 401). Owner review of the dashboard remains pending. Future telemetry changes must remain privacy-safe and bounded:
- Aggregate request counts, response classes, latency buckets and D1 rows_read/rows_written where available.
- Record webhook event IDs, provider, signature/processing status and redacted failure codes; never log secrets, raw signatures, card data, CNIC images or full customer payloads.
- Bound retention, apply indexes and sampling, prevent public access, and alert on queue age, repeated failures, quota thresholds and backup failures.
- Label quota figures as estimates unless obtained from authoritative Cloudflare usage data. Do not infer precise daily D1 totals from arbitrary per-query samples.

### 7. Hardware and device acceptance

Run a documented physical Android acceptance pass for camera/gallery uploads, microphone, Urdu/Roman Urdu TTS, barcode/QR scanners, mobile checkout, touch targets and browser/PWA behavior. Test 58mm and 80mm printers with actual supported models. WebSerial/ESC-POS and cash-drawer kick remain optional, permission-gated and device-tested; never trigger a drawer based only on an unconfirmed payment.

### 8. Content, legal and catalogue acceptance

- Review the published CMS homepage in Admin → Content Studio. The current home page has seven sections, five navigation links, four FAQs and three verified category artworks. PR #38 deployed category-image save validation, public media authorization and archive protection; migrations 0042–0043 are applied. Owner should confirm product assortment, final copy, pricing language and contact paths before broad promotion.
- Verify product authenticity, image/variant matching, physical size/colour stock and barcode quality with the owner.
- Obtain qualified legal review for CNIC collection, consent, retention, access and deletion policy before treating current retention as compliant.
- Attach and verify a custom domain only after DNS, TLS, redirects, canonical URLs, email and security headers are tested.

## nopCommerce comparison: adopt and defer

Adopt architectural patterns: explicit service/data boundaries, typed provider adapters, fine-grained permissions, versioned API contracts, robust catalogue attributes, operational telemetry, safe media derivatives, backup/restore drills and automated integration tests.

Do not import nopCommerce source, schema, theme or dependencies. Defer multi-store, multi-vendor, multi-currency, gift cards, advanced tax engine and loyalty until DeVErve business rules, legal/tax advice, staffing and operating budget justify them. Feature count is not production readiness.

## Definition of production accepted

A capability is accepted only when all four exist:
1. Reviewed code and migration with CI passing.
2. Server-side authorization, input validation, idempotency and audit evidence where applicable.
3. Automated integration/regression tests plus real provider/device tests where applicable.
4. Production rollout, monitoring, rollback and owner sign-off.

Do not state that the platform is 100% production-ready while any critical release gate above remains unverified.

## Live production verification addendum — 23 November 2026

Read-only Cloudflare API and production D1 checks were performed during continuation of PR #40. No production data, schema, secrets or deployment settings were modified.

- Cloudflare Pages project `deverve-official` has production and automatic deployments disabled; preview deployment setting is `none`. The latest successful production deployment remains `bea6a0c6`, built from main commit `46c68c94ce2b689dbff00b863259e32a458025e3`. A new PR therefore cannot be treated as preview-deployed or production-deployed.
- The production D1 database `deverve-production` contains the live commerce/POS schema (including `pos_sales`, `pos_sessions`, `pos_sale_items`, `pos_payments`, `pos_receipt_outbox`, `inventory_movements`, `financial_transactions` and `admin_pos_cashiers`). No offline POS device, permit, allocation, event or reconciliation tables exist.
- Read-only aggregate checks found one active staff account, zero active POS cashier grants, one open register session, one existing POS sale (voided), seven active product variants, two queued POS receipt deliveries (one email and one WhatsApp), and two queued owner-notification outbox entries. These are operational follow-ups, not permission to modify or close existing records automatically.
- The open register session belongs to the existing main register and has been open since 18 November 2026. Owner must verify the physical drawer and shift records before any close/reconciliation action.
- The current production D1 has no migration-history table. Schema acceptance must therefore compare actual table/index/trigger definitions with repository migrations and recorded deployment evidence; do not assume a local migration ledger exists.
- PR #40 documentation CI run `45156253162` completed successfully. This validates the repository CI job for the documentation-only change; it does not validate offline POS implementation, production Worker behavior or physical hardware.
- The backup workflow exists at `.github/workflows/d1-backup-restore.yml` and runs daily at 02:00 Pakistan Standard Time. Run `45330719916` attempt 7 completed a full AES-256-GCM production export, encrypted R2 upload/read-back, isolated D1 restore, schema-object and row-count comparison, and confirmed temporary-database deletion. Earlier failed encrypted artifacts remain private in R2 for audit/retention review; the successful artifact is `d1/encrypted/deverve-production-20261124T145410Z.dvbackup`. Backup protection is verified for this D1 snapshot, but independent off-account copy, key custody and retention/RPO/RTO are still pending.

**Operational hold:** do not close the existing open POS session, clear queued outbox records, grant cashier access, alter stock allocations, create an offline permit, run a production migration, or enable automatic deployments as part of this design-only work. These actions require owner verification and the relevant acceptance procedure.
