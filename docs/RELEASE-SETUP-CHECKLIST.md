# De VERVE release and owner setup checklist

Last reconciled: 20 November 2026 — post-merge CI verification  
Target: Pakistan-first storefront, garments catalogue, rentals, POS and AI-assisted operations.

This checklist separates source-code work from account configuration and production operations. A passing build does not complete an external provider integration. Do not enable a provider until its test transaction and callback/delivery path have been verified.

## Release gates

### 1. Database and storage

- [ ] Take and verify a fresh production D1 backup/export before any schema change.
- [x] Complete a same-account R2 copy/restore drill on 19 Nov 2026: 15 objects / 1,522,058 bytes copied from `deverve-media-private` to `deverve-r2-restore-drill-20261119`, restored into an isolated test bucket, and all 15 object sizes + ETags matched. Original bucket remained unchanged; temporary restore bucket was deleted. A metadata manifest records content types and custom metadata.
- [ ] Establish an independent off-account R2 backup with separately controlled credentials and repeat the restore drill. A same-account bucket is not an independent backup; a D1 export does not contain R2 object bytes.
- [x] Reconcile production schema read-only on 20 Nov 2026. Exact live columns/indexes confirm migrations 0028, 0029, 0030, 0031 and 0033 are already reflected; both 0032 CNIC protection triggers are present. Migration 0034's unique active size/colour index is absent; its read-only preflight found no duplicate normalized active single-option combinations (one legacy multi-option row is intentionally excluded). Migration 0035's `order_inventory_reservations` table and migration 0036's `ai_task_runs` / `ai_task_events` tables are absent. No migration-ledger table exists, so reconcile by exact schema signatures, not a guessed migration history.
- [ ] Apply only the verified missing migrations, in dependency order, after backup and isolated rehearsal: 0034 → 0035 → 0036. Re-check existing 0028–0033 signatures and verify both 0032 CNIC triggers remain present before and after.
- [x] Verify migration 0036 as part of the full 0001–0036 isolated rehearsal above; do not apply it to production until backup, schema reconciliation and release-window gates are complete.
- [ ] Verify D1 constraints, indexes, foreign keys, migration effects and application smoke tests after each approved migration.

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
- [ ] Apply migrations 0034, 0035 and 0036 to production only after backup, approved release window and migration rehearsal. Current read-only production evidence: 0034 index absent, 0035 reservation table absent, and 0036 `ai_task_runs` / `ai_task_events` absent.
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
- Read-only production D1 query on 20 Nov confirmed `ai_task_runs` and `ai_task_events` are absent; the migration-0036 task-continuity schema is not deployed.
- No Cloudflare Queue currently exists in the connected account, so the asynchronous Safepay queue/consumer path is not activated.
- The current Pages production configuration does not list Safepay, Resend, WhatsApp Cloud API or Turnstile provider bindings. Provider credentials and account-side verification remain owner setup gates.
- A read-only production count check found existing catalogue and business records; do not seed, overwrite or publish catalogue data without the owner's approved source data.
- Read-only production D1 query on 20 Nov confirmed 61 application tables, including products, product variants, inventory movements, payment webhook events and notification outbox. Signature checks confirm 0028–0033 are already reflected, including permanent-CNIC triggers. The 0034 index, 0035 reservation ledger and 0036 AI task ledger are absent. One legacy multi-option variant is intentionally outside the 0034 unique index; there are no duplicate active normalized single-option combinations. No migration ledger table was found.
- A production D1 export request completed in Cloudflare and returned an export artifact, but it has not been downloaded, independently stored or restore-tested. The backup gate remains open.
- No production deployment, D1 migration, secret change, queue creation or live data write was performed during this audit.

## Latest automated verification — 20 November 2026

- PR #5 implementation was merged into `main` at `4e11bd757a41f7f23785ffd1476aef3d56a5e176`; this checklist was subsequently reconciled in documentation commit `519a7ce98fd9811969b281cd467f155f6a1cc320`.
- GitHub Actions push run [#1364](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44608321603) completed successfully on that exact main commit.
- Build/type-check and production dependency audit passed; audit reported 0 vulnerabilities.
- Worker authentication tests, SQL binding audit, Pages security-header checks and schema smoke passed. Schema smoke verified 36 migration files, 53 tables, constraints and foreign keys.
- Playwright browser suite: 88 passed across desktop Chromium and mobile Chromium. Includes CSV product import and DOCX/XLSX extraction on both projects, and mobile 100-image intake, direct owner publishing and scanner regression tests.
- Important limitation: the remote production-like D1 integration step was skipped because GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are not configured. The isolated 0001–0036 D1 migration rehearsal was separately completed against a temporary database on 20 Nov; this does not prove the production database is migration-ready.
- A production D1 export request completed in Cloudflare, but the export has not yet been downloaded, independently stored and restored. It is not a verified backup.

## Current branch and release boundary

- Repository: `Nabeelwasti/Deverve-Official`
- Production branch: `main`
- PR #5 is merged; merge commit: `4e11bd757a41f7f23785ffd1476aef3d56a5e176`.
- Cloudflare Pages source deployments and production deployments remain disabled. No deployment has been performed from this merge commit.
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
