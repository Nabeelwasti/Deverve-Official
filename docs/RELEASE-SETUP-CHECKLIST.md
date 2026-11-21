# De VERVE release and owner setup checklist

Last reconciled: 21 November 2026 — catalogue release deployed; owner/operational acceptance still open  
Target: Pakistan-first storefront, garments catalogue, rentals, POS and AI-assisted operations.


## Latest production release — 21 November 2026

- [x] Merge reviewed catalogue cleanup and bulk-import hardening (PR #6).
- [x] Exact-main CI run [44882915815](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44882915815) passed 114 desktop/mobile browser tests plus build/type-check, dependency audit, Worker tests, D1 schema checks and security-header checks.
- [x] Pin Cloudflare Pages build to Node.js 24 with `.node-version`; latest Pages build used Node.js 24.22.1 and completed without the prior ZXing engine warning.
- [x] Deploy exact source commit `8798eb8e43a6b78dd5226334ea158ab3af507edc` to Pages deployment `03fd4f75-a5fa-4e03-804f-fa4cac529621`. Cloudflare reports successful build and deploy stages.
- [x] Production browser smoke: canonical `https://deverve-official.pages.dev/` returned HTTP 200, expected De VERVE title, CSP, HSTS and `nosniff` headers.
- [x] Remove non-functional Home trust-pillar cards and generic intro strip; keep functional category navigation.
- [x] Unpublish obvious placeholder catalogue entries `Testing` (zero active variants) and `Choco` (description `Test`, no product image). Added audit-log entries; underlying stock and media were retained. Rechecked the public Home page and confirmed neither placeholder is shown.
- [x] Restore Cloudflare source-triggered and production auto-deploy settings to disabled after the controlled release; preview deployments remain disabled.
- [ ] Complete independent off-account D1/R2 backup and isolated restore.
- [ ] Reconcile physical stock by exact size/colour; correct the legacy Trouser aggregate row, Tolaza colour/photo mismatch and missing SKU/barcodes.
- [ ] Verify T2 product identity and brand authenticity before relying on the PULL&BEAR claim; attach verified product photos and details to incomplete published listings.
- [ ] Obtain owner/legal approval for CNIC retention.
- [ ] Verify real Gemini key decryption/provider response, Turnstile challenge acceptance, Resend delivery and Meta WhatsApp opt-in/templates.
- [ ] Complete physical Android camera/barcode/QR acceptance, POS/finance reconciliation, checkout and rental acceptance.
- [ ] Configure GitHub Actions Cloudflare test credentials and run the isolated remote D1 integration suite; ordinary CI currently skips it.


This checklist separates source-code work from account configuration and production operations. A passing build does not complete an external provider integration. Do not enable a provider until its test transaction and callback/delivery path have been verified.

## Release gates

### 1. Database and storage

- [ ] Take and verify a fresh production D1 backup/export before any schema change.
- [x] Complete a same-account R2 copy/restore drill on 19 Nov 2026: 15 objects / 1,522,058 bytes copied from `deverve-media-private` to `deverve-r2-restore-drill-20261119`, restored into an isolated test bucket, and all 15 object sizes + ETags matched. Original bucket remained unchanged; temporary restore bucket was deleted. A metadata manifest records content types and custom metadata.
- [ ] Establish an independent off-account R2 backup with separately controlled credentials and repeat the restore drill. A same-account bucket is not an independent backup; a D1 export does not contain R2 object bytes.
- [x] Reconcile production schema read-only on 20 Nov 2026. Exact live schema inspection confirms the expected structures from migrations 0028–0036, including the 0034 unique active size/colour index, 0035 order inventory-reservation ledger and 0036 AI task continuity tables. No migration-ledger table exists, so continue reconciling by exact schema signatures rather than guessed migration history. Production contains 63 application tables. One legacy multi-option variant still requires physical stock reconciliation.
- [x] Applied production migrations 0034 → 0035 → 0036 on 20 Nov 2026 after read-only preflight. Verified the unique-index preflight returned zero duplicate groups; production had zero orders and four variants. Post-migration schema checks confirm the 0034 index, 0035 reservation table and both indexes, and 0036 AI task tables and both indexes are present. Existing order, reservation, AI-run and AI-event counts are all zero. D1 Time Travel remains available for point-in-time recovery; an independent off-account backup is still outstanding.
- [x] Migration 0036 was included in the full 0001–0036 isolated rehearsal and is present in production. Do not rerun it; verify schema signatures before future migrations.
- [x] Verify migration objects and post-migration read-only counts in production after 0034–0036. Full application and payment smoke tests remain outstanding.

### 2. AI and catalogue

- [x] Private AI Command Centre, bounded multimodal intake and cross-batch contact-sheet comparison are implemented on the feature branch.
- [x] Product drafts and size/colour variant matrix workflow are implemented.
- [x] Direct owner/manager product publishing and exact-SKU stock command are implemented; stock adjustments now write inventory movement and audit records.
- [x] Resumable four-image transport batches are integrated with the 100-file AI task; the four-file storage request size is not a task attachment limit.
- [x] Post-merge CI on the exact main commit passed build/type-check, production dependency audit (0 vulnerabilities), Pages security-header checks, Worker tests, SQL binding audit, schema validation (36 migrations / 53 tables), and 88 Playwright desktop/mobile browser tests. GitHub Actions run #1364: https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44608321603.
- [x] Pass CSV and DOCX/XLSX import end-to-end tests on the exact merged main commit: desktop and mobile Chromium both passed in GitHub Actions run #1364.
- [x] Automated desktop and mobile Playwright coverage selects and analyses all 100 images: 34 image-analysis batches, compact cross-batch planning and seven numbered contact sheets.
- [ ] Run real-provider 100-image quota/fallback tests and interruption/retry acceptance on a physical Android device; browser mocks do not prove Gemini provider or camera-device behaviour.
- [x] Implement deterministic CSV product import with local validation/preview, duplicate size-colour detection, UTF-8 BOM support, permission-aware cost fields, and one atomic D1 batch for products, variants, opening-stock movements and audit events. Products are created as drafts; generated SKU/barcodes are assigned where the CSV omits them.
- [x] CSV import end-to-end tests passed on desktop and mobile Chromium in GitHub Actions run #1364.
- [x] Implement browser-side DOCX paragraph/table and XLSX worksheet extraction with ZIP integrity checks, path traversal/encryption/ZIP64 rejection, archive expansion limits, XML DTD/entity rejection, and no formula or macro execution.
- [x] DOCX/XLSX extraction end-to-end tests passed on desktop and mobile Chromium in GitHub Actions run #1364.
- [ ] Verify each configured Gemini project/model for image/PDF support, quota, fallback order and Google Search grounding. Multiple keys in one Google project do not create separate quota pools.
- [x] Full migration rehearsal: migrations 0001–0036 were applied sequentially to an isolated temporary Cloudflare D1 on 20 Nov 2026; every migration succeeded. The temporary database was deleted. This rehearsal did not alter production.
- [x] Apply migrations 0034, 0035 and 0036 to production on 20 Nov 2026. Post-migration checks confirm all eight expected tables/indexes are present and no duplicate active normalized single-option variants exist. Production orders and reservation/AI task tables currently contain zero rows.
- [ ] Add GitHub Actions Cloudflare test credentials so the remote D1 integration step can run automatically; current CI reports this step as skipped because those secrets are absent.

### 3. Payments and financial operations

- [ ] Keep Safepay disabled until the exact merchant product's sandbox contract is confirmed and the full checkout → webhook → order → financial ledger flow is tested.
- [x] Safepay Queue producer/consumer source, signature re-verification, payload digest validation, retry and dead-letter handling are implemented.
- [ ] Provision `deverve-payment-webhooks` and `deverve-payment-webhooks-dlq`, add the Pages producer binding, configure the consumer's matching D1 binding and server-side secrets, then test the complete sandbox callback/reconciliation path.
- [ ] Test duplicate webhook delivery, conflicting event payload replay, amount/order mismatch, late events, retries and reconciliation on isolated D1.
- [ ] Configure COD and owner-approved bank/wallet methods. Direct transfer remains pending until an owner verifies the receipt; do not imply automatic bank verification.
- [ ] Configure Safepay secrets only in Cloudflare server-side secrets after sandbox sign-off. Never place provider secrets in Vite/browser variables.
- [ ] Verify refund and void flows against actual accounting policy; refunds require a recorded method and transaction/receipt reference.

### 4. Customer communication

- [ ] Verify the sender domain and DNS records for Resend; configure API key and from-address as server-side secrets.
- [ ] Register/verify the business number in Meta WhatsApp Manager; configure Phone Number ID, system-user token, approved template names and language.
- [ ] Test opt-in and consent boundaries, delivery receipts, retries and failed-message recovery for email and WhatsApp.
- [ ] Configure and test Turnstile site/secret keys on production origins.

### 5. Business content and public presence

- [ ] Owner supplies the approved product catalogue: names, genuine brand claims, categories, descriptions, PKR retail/wholesale prices, SKU/barcodes, sizes, colours, quantities and product photos.
- [ ] Owner confirms vehicle fleet, availability, rental rates, deposit, driver terms, delivery/pickup areas and cancellation rules.
- [ ] Owner approves delivery, exchange/return, privacy, terms and rental policies in Urdu/English.
- [ ] Verify the custom domain, DNS, HTTPS, canonical URLs, sitemap, robots rules, structured data and search indexing.
- [ ] Complete Google Business Profile ownership/verification and check the public listing details.
- [ ] Configure Meta Page/Instagram/Threads/LinkedIn ownership, profile consistency, contact buttons and WhatsApp destination.

### 6. Operational acceptance

- [ ] Test the full customer journey on a physical Android device: catalogue, variant availability, cart, checkout, order tracking, enquiry, rental request and camera/barcode/QR scanner.
- [ ] Test admin owner/manager/catalogue/viewer permissions, MFA/session expiry, audit logs, rate limits, CSRF/origin checks and backup recovery.
- [ ] Verify R2 private object access and no public leakage of rental CNIC evidence or private media.
- [ ] Test alerting, provider failures, D1/R2 capacity, outbox retries, scheduled jobs and restore procedures.
- [ ] Complete an owner acceptance review and record the exact release commit, migration evidence and rollback plan.

## R2 backup/restore drill evidence — 19 November 2026\n\n- Source: private bucket `deverve-media-private` (unchanged).\n- Retained drill copy: `deverve-r2-restore-drill-20261119` (private; 15 objects plus `_deverve-backup-manifest.json`).\n- Isolated restore: all 15 objects were restored and verified by matching ETag and byte size; the temporary restore bucket `deverve-r2-restore-check-20261119` was then emptied and deleted.\n- Total source payload verified: 1,522,058 bytes.\n- Scope limitation: Cloudflare's account-level R2 object API copy did not reapply per-object custom metadata to restored objects; the manifest preserves that metadata for a controlled application-level restore. This is a same-account recovery drill, not an off-account disaster-recovery copy.\n\n## Read-only production configuration snapshot — 19 November 2026

These are verified release blockers, not permission to change live resources:

- Cloudflare Pages currently exposes only the `deverve-official.pages.dev` domain; no custom domain is connected.
- Pages source deployments and production deployments are disabled in the current project configuration. A production rollout therefore remains a separately authorized operation.
- Production migrations 0034–0036 were applied on 20 Nov 2026; `ai_task_runs`, `ai_task_events` and `order_inventory_reservations` are now present.
- No Cloudflare Queue currently exists in the connected account, so the asynchronous Safepay queue/consumer path is not activated.
- The current Pages production configuration does not list Safepay, Resend, WhatsApp Cloud API or Turnstile provider bindings. Provider credentials and account-side verification remain owner setup gates.
- A read-only production count check found existing catalogue and business records; do not seed, overwrite or publish catalogue data without the owner's approved source data.
- Production schema checks confirmed the existing 0028–0033 schema and CNIC protection triggers, then applied 0034–0036. The 0034 uniqueness preflight returned zero duplicate active normalized single-option groups; one legacy multi-option row remains intentionally outside the index. Production currently has zero orders, four product variants, zero inventory reservations, zero AI task runs and zero AI task events. No migration ledger table was found.
- A fresh D1 export job completed, but its signed artifact could not be retrieved through the available connector's outbound-host restrictions. No SQL dump has been independently stored or restore-tested. The independent-backup gate remains open. D1 Time Travel is automatically enabled for point-in-time recovery; it is not a substitute for an off-account backup.
- Production D1 migrations 0034–0036 were applied and verified. No production deployment, secret change, queue creation or business-data write has yet been performed.

## Latest automated verification — 20 November 2026

- PR #5 implementation was merged into `main` at `4e11bd757a41f7f23785ffd1476aef3d56a5e176`; this checklist was subsequently reconciled in documentation commit `519a7ce98fd9811969b281cd467f155f6a1cc320`.
- GitHub Actions push run [#1364](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44608321603) completed successfully on that exact main commit.
- Build/type-check and production dependency audit passed; audit reported 0 vulnerabilities.
- Worker authentication tests, SQL binding audit, Pages security-header checks and schema smoke passed. Schema smoke verified 36 migration files, 53 tables, constraints and foreign keys.
- Playwright browser suite: 88 passed across desktop Chromium and mobile Chromium. Includes CSV product import and DOCX/XLSX extraction on both projects, and mobile 100-image intake, direct owner publishing and scanner regression tests.
- Important limitation: the remote production-like D1 integration step was skipped because GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are not configured. The isolated 0001–0036 D1 migration rehearsal was separately completed against a temporary database on 20 Nov; this does not prove the production database is migration-ready.
- A fresh production D1 export job completed, but the export file is not downloaded or independently restored because the available connector cannot retrieve the signed export host. D1 Time Travel provides 30-day point-in-time recovery, but an off-account backup remains outstanding. An empty private R2 bucket `deverve-db-backups` was created as a destination; no SQL dump has been uploaded to it yet.

## Current branch and release boundary

- Repository: `Nabeelwasti/Deverve-Official`
- Production branch: `main`
- PR #5 is merged; merge commit: `4e11bd757a41f7f23785ffd1476aef3d56a5e176`.
- Cloudflare Pages Git production deployments were enabled on 20 Nov 2026 for the `main` branch only; preview deployments remain disabled. The next `main` push is the controlled production deployment trigger. The current latest deployment remains the older release until that deployment completes.
- Production release remains blocked on independent backup/restore, production schema reconciliation and migration verification, owner/provider configuration, and live acceptance. Do not enable deployment or run production migrations until these gates are met.

## Required owner-provided setup (never paste secrets into chat)

Provide/configure through the appropriate provider dashboard or Cloudflare secret management:
- Domain registrar/DNS access and the final public domain.
- Resend verified sender domain and server-side API key.
- Meta WhatsApp Business phone number, Phone Number ID, system-user token and approved message templates.
- Safepay merchant account, exact checkout product, sandbox credentials and webhook configuration.
- Cloudflare Turnstile site/secret keys and Cloudflare production account access.
- Approved product/vehicle data, pricing, policies and brand claims.
- Owner's preferred Google Business Profile and social account destinations.

Keep secrets in the provider dashboard or Cloudflare encrypted secrets. Share only non-secret IDs/configuration labels when coordination is needed.


## Production migration and deployment activation — 20 November 2026

- D1 database: `deverve-production` (`355da876-17c4-4762-a59d-bb85f2e4551b`).
- Migration 0034: `idx_product_variants_unique_active_options` created successfully after a zero-duplicate preflight.
- Migration 0035: `order_inventory_reservations` and both order/status + variant/status indexes created successfully.
- Migration 0036: `ai_task_runs`, `ai_task_events` and both supporting indexes created successfully.
- Post-migration checks: all eight expected schema objects present; orders=0, reservations=0, AI task runs=0, AI task events=0; active normalized single-option duplicate groups=0.
- Cloudflare D1 Time Travel is enabled automatically by Cloudflare and provides point-in-time recovery for the previous 30 days. This is not independent off-account backup.
- Created private R2 bucket `deverve-db-backups` in APAC. It is currently empty. The completed D1 export artifact could not be downloaded through the available connector's outbound-host restrictions; no independent SQL backup/restore test is claimed.
- Cloudflare Pages Git production deployments are enabled for `main` only. Preview deployments remain disabled. The next main-branch push triggers the production build/deployment.
- Physical Android device acceptance remains intentionally scheduled after deployment, as requested.


## Staged customer-care and voucher release (PR #7)

This section describes the new staged voucher release. It is not production-active until the PR is merged, migration 0037 is applied after a verified backup, and the final Pages deployment passes smoke checks.

- [ ] Require the exact PR head to pass build/type-check, production dependency audit, Worker tests, SQL binding checks, migration/schema tests and desktop/mobile browser tests.
- [ ] Before applying migration 0037, create and verify a fresh D1 export and an independently controlled encrypted backup. Confirm the restore procedure and keep the backup encryption key separate.
- [ ] Confirm the 0037 schema on a disposable D1 database, including one-voucher-per-order, one-voucher-per-exchange, immutable redemption history, max-use enforcement, per-customer limits, first-order-only eligibility and exchange-case ownership/status checks.
- [ ] Apply migration 0037 once to production D1. Verify both voucher tables, indexes and triggers by exact schema read-back. Never rerun the migration blindly.
- [ ] Deploy the merged main commit to Cloudflare Pages manually. Verify the deployment commit, successful build/deploy stages, canonical pages.dev HTTP 200, security headers, Worker API health and customer checkout.
- [ ] In Admin → Sales → Discount vouchers, test a campaign code, fixed amount, percentage, free delivery, expiry, minimum basket, max redemptions, per-customer limit and revocation using test customer accounts/orders only.
- [ ] Test first-order voucher against a customer with no non-cancelled orders and reject it for a customer with a previous non-cancelled order.
- [ ] Complete a test exchange case for each supported reason (size issue, damaged item, wrong item/colour mismatch). Verify only a completed case can receive a customer-bound one-time voucher, that the reason mapping is correct, and that the prefilled WhatsApp link opens the correct customer's chat without sending automatically.
- [ ] Redeem a voucher at checkout while signed in. Verify the server-calculated total, order discount fields, single redemption row, usage increment, audit history and customer-specific rejection. Test duplicate, expired, revoked, wrong-customer, wrong-case, under-minimum and concurrent redemption attempts.
- [ ] Cancel a test order after voucher redemption. Verify the redemption is marked reversed, usage count is restored, and the same active code can be used again without allowing two active redemptions for the exchange case.
- [ ] Confirm no spend-based or advance-payment discounts are displayed or applied without a configured voucher. Confirm only one voucher can apply per order and that wholesale quotation redemption remains disabled.
- [ ] Recheck the storefront's restored factual service cards and approved customer feedback. Unapproved reviews, unverified-purchase labels, fabricated testimonials, inactive newsletters and unsupported delivery/brand claims must not be published.
- [ ] Confirm the visible Add product label in both the admin dashboard and catalogue workspace on desktop and a narrow mobile viewport.
- [ ] Record owner acceptance of voucher amounts, expiry defaults, customer-care compensation policy, published exchange policy and privacy notice. Confirm the indefinite CNIC retention instruction with the owner and obtain qualified Pakistan legal review before representing it as legally approved.
- [ ] Keep the release in a non-accepted state if any required backup, migration, checkout, security, device or owner-acceptance check fails. A successful Pages deployment alone is not production acceptance.
