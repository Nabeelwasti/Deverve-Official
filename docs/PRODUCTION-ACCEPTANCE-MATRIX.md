# Production acceptance matrix

**Last reviewed:** 23 November 2026  
**Production:** https://deverve-official.pages.dev  
**Repository:** https://github.com/Nabeelwasti/Deverve-Official

**Release rule:** A passing build is necessary, not sufficient. Mark an operational capability accepted only after the evidence listed below exists.

## Verified application foundations

| Capability | Verified foundation | Acceptance status |
|---|---|---|
| POS cashier RBAC | PR #34 merged; separate revocable grant and invite tables; server-side deny-by-default route boundary; cash-only sale guard; own-shift and own-sale scoping; atomic shift close. Production D1 migration 0040 applied; Pages deployment `0b6f305a-c834-4477-8a1e-8ffdca7a6cb7` succeeded from main commit `7840388c05699cfdb9f6640a5b3bcb76bae98daf`. | Code and schema deployed; zero cashier grants exist. Owner-operated invitation, live authenticated cashier workflow and physical shift/device acceptance still pending |
| Owner system health | PR #35 merged; owner-only endpoint and workspace report D1, outbox queues, payment counts, stock anomalies, POS shifts, staff/cashier counts and provider configuration without returning secret values. Deployment `f41edaad-e700-4a5f-90d3-6ec9d827dbae` succeeded; unauthenticated route check returns 401. | Code deployed; owner login/dashboard review pending. Provider delivery, Turnstile and backup/restore are explicitly not considered verified by configuration telemetry |

| Capability | Verified foundation | Acceptance status |
|---|---|---|
| Cloudflare Pages | Production deployment `41aca77d-20ca-4110-a92c-09a9e95ac3fd` completed successfully from application commit `ec0a0119e1686a4b4ebdd89722d279066a4962cd`; PRs #30 and #31 are included. On 23 November, the homepage HTML/title and `/api/health` (`status=ok`, `database=connected`) were confirmed through Cloudflare Browser Rendering. | Deployed; targeted live health check passed; complete production-smoke workflow, protected-route checks, security-header checks and provider health acceptance still outstanding |
| D1 commerce schema | Live database contains products, variants, orders, inventory movements, reservations, POS, payments, webhook events and audit tables | Schema exists; integration tests outstanding |
| Public catalogue API | Live `/api/products` returned 3 published products; a response inspection confirmed no `cost_price_paisa` field on products or variants | Targeted public-data check passed; owner catalogue/authenticity reconciliation remains outstanding |
| Catalogue indexes | Production D1 contains `idx_product_variants_sku_nocase` and `idx_pos_sales_status_created`; migration 0039 is applied and query plans were verified against the live database | Applied and query-plan verified; sustained workload/concurrency acceptance remains outstanding |
| POS | Registers, sessions, sales, sale items, payments, voids, cashbook and receipt outbox exist | Online workflows implemented; owner reconciliation and device acceptance outstanding |
| Shared stock | Inventory movement and order reservation ledgers exist | Concurrent cross-channel tests outstanding |
| Payments | Payment attempts and webhook-event foundations exist | COD active; live provider acceptance outstanding |
| Turnstile | Public form verification calls a private verification Worker | Live configuration and form acceptance outstanding |
| Email / WhatsApp | Outbox and retry logic exist | Provider credentials, consent and delivery acceptance outstanding |
| PWA | Manifest and service worker cache the shell and static assets | Installable shell; not an offline-first POS |
| Encrypted D1 backup | AES-256-GCM export and isolated restore script plus GitHub Actions workflow exist. PR #33 makes temporary recovery-database deletion failure fatal, preventing a false successful restore result. | Not accepted until required secrets, an actual encrypted export, isolated restore, confirmed cleanup and retention verification pass |

## Release blockers and owner-controlled prerequisites

### 1. Encrypted backups and recovery

The repository workflow .github/workflows/d1-backup-restore.yml is scheduled daily at 02:00 Pakistan Standard Time (21:00 UTC). It is not operationally active until all required GitHub Actions secrets are configured and a full run succeeds:

- CLOUDFLARE_API_TOKEN: narrowly scoped D1 read, R2 object write/read and isolated restore permissions required by the script.
- CLOUDFLARE_ACCOUNT_ID.
- D1_BACKUP_ENCRYPTION_KEY: 32 random bytes encoded as 64 hex characters. Generate offline with openssl rand -hex 32; store in an owner-controlled password manager, never in the repository or backup bucket.
- Confirm private bucket deverve-db-backups exists and token permissions are sufficient.

Required evidence: encrypted production snapshot, SHA-256 integrity check, successful decrypt and restore into an isolated non-production D1 database, row-count/schema comparison, confirmed deletion of the isolated database, retention verification and a documented recovery exercise. The restore script now exits unsuccessfully if temporary database deletion cannot be confirmed (PR #33). A green syntax check is not a backup. A successful upload is not a restore test.

The scheduled workflow performs the isolated restore drill too. Monitor its Actions history and configure failure notifications. No backup is guaranteed until the first successful run is observed. Keep the encryption key independently from the R2 bucket.

### 2. Offline-first POS

The current service worker intentionally excludes API requests and POS uses live admin API calls. The current POS is not offline-first. Do not enable offline sales by simply caching /api/admin/pos/*.

Required implementation and acceptance:
- Cache only the minimum POS catalogue snapshot in IndexedDB, partitioned by authenticated staff account and schema version; purge on logout, account switch or permission revocation.
- Persist a cash-only offline queue with unique idempotency keys, immutable price/quantity snapshots, staff/session identity and visible pending status.
- Never queue card, bank, wallet, hosted checkout, refunds, voids, account edits, stock adjustments or session open/close while offline.
- On reconnect, submit queued sales through the existing server-authoritative POS endpoint; server must revalidate role, open session, current price, product status and stock in one atomic D1 transaction.
- Keep pending sales visibly pending until acknowledged. Handle duplicate retries, expired sessions, changed prices, insufficient stock, revoked access and partial network failures without silently dropping or double-charging.
- Provide cashier reconciliation for rejected/ambiguous queued sales. Never silently auto-adjust cash already received.
- Test airplane-mode reload, browser/tab termination, low storage, logout, multiple devices, duplicate replay and stock sold online while offline.

Until implemented and passed on real Android devices, use online POS only and do not advertise offline sales as supported.

### 3. RBAC and POS permissions

The current POS route authorizes owner, manager and orders roles; it does not expose the proposed dedicated CASHIER role. Do not simply add a role string. Define a server-side permission matrix, role migration, UI visibility rules, session invalidation and tests for every route.

Cashier permissions should be restricted to permitted register operations: catalogue lookup, sale creation, receipt view/print and own shift operations. Price overrides, discounts beyond approved rules, refunds/voids, cashbook, account management, exports, audit logs, staff and configuration require separate authorization. All checks must occur server-side.

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

A dedicated owner-only /admin/system-health dashboard is not yet certified. Build it with privacy-safe, bounded telemetry:
- Aggregate request counts, response classes, latency buckets and D1 rows_read/rows_written where available.
- Record webhook event IDs, provider, signature/processing status and redacted failure codes; never log secrets, raw signatures, card data, CNIC images or full customer payloads.
- Bound retention, apply indexes and sampling, prevent public access, and alert on queue age, repeated failures, quota thresholds and backup failures.
- Label quota figures as estimates unless obtained from authoritative Cloudflare usage data. Do not infer precise daily D1 totals from arbitrary per-query samples.

### 7. Hardware and device acceptance

Run a documented physical Android acceptance pass for camera/gallery uploads, microphone, Urdu/Roman Urdu TTS, barcode/QR scanners, mobile checkout, touch targets and browser/PWA behavior. Test 58mm and 80mm printers with actual supported models. WebSerial/ESC-POS and cash-drawer kick remain optional, permission-gated and device-tested; never trigger a drawer based only on an unconfirmed payment.

### 8. Content, legal and catalogue acceptance

- Publish owner-approved CMS homepage content; the last documented production inspection found the CMS page table empty and static homepage fallback active.
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