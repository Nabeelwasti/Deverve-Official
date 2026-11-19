# De VERVE release and owner setup checklist

Last reconciled: 19 November 2026  
Target: Pakistan-first storefront, garments catalogue, rentals, POS and AI-assisted operations.

This checklist separates source-code work from account configuration and production operations. A passing build does not complete an external provider integration. Do not enable a provider until its test transaction and callback/delivery path have been verified.

## Release gates

### 1. Database and storage

- [ ] Take and verify a fresh production D1 backup/export before any schema change.
- [ ] Take an independent R2 media backup and complete a restore drill. A D1 export does not contain R2 object bytes.
- [ ] Reconcile production schema immediately before migration. The 19 Nov read-only audit found migrations 0028, 0029, 0030, 0031 and 0033 absent; migration 0032's CNIC protection triggers were present. This is a historical observation, not permission to apply migrations.
- [ ] Apply the missing migrations in dependency order only after backup and isolated rehearsal: 0028 → 0029 → 0030 → 0031 → 0033. Verify the 0032 CNIC triggers remain present.
- [ ] Rehearse and verify migration 0036 (`ai_task_runs`, `ai_task_events`) on an isolated D1 database before scheduling its production application.
- [ ] Verify D1 constraints, indexes, foreign keys, migration effects and application smoke tests after each approved migration.

### 2. AI and catalogue

- [x] Private AI Command Centre, bounded multimodal intake and cross-batch contact-sheet comparison are implemented on the feature branch.
- [x] Product drafts and size/colour variant matrix workflow are implemented.
- [x] Direct owner/manager product publishing and exact-SKU stock command are implemented; stock adjustments now write inventory movement and audit records.
- [x] Resumable four-image transport batches are integrated with the 100-file AI task; the four-file storage request size is not a task attachment limit.
- [x] Latest audited code passed CI build, type-check, dependency audit, Pages headers, Worker tests, schema validation and 82 Playwright browser tests on the exact tested PR head.
- [x] Automated desktop and mobile Playwright coverage selects and analyses all 100 images: 34 image-analysis batches, compact cross-batch planning and seven numbered contact sheets.
- [ ] Run real-provider 100-image quota/fallback tests and interruption/retry acceptance on a physical Android device; browser mocks do not prove Gemini provider or camera-device behaviour.
- [ ] Finish CSV import as a deterministic validated preview + duplicate report + atomic product/variant creation workflow.
- [ ] Decide and implement safe DOCX/XLSX import scope, with macro/archive rejection, file-size limits and isolated parsing.
- [ ] Verify each configured Gemini project/model for image/PDF support, quota, fallback order and Google Search grounding. Multiple keys in one Google project do not create separate quota pools.
- [x] Migration 0036 was applied to a temporary isolated D1; both tables and indexes, task/event restoration and cascading event deletion passed. The temporary database was deleted.
- [ ] Apply migration 0036 to production only after backup, approved release window and migration rehearsal; the read-only production check found `ai_task_runs` and `ai_task_events` absent.
- [ ] Add GitHub Actions Cloudflare test credentials so the remote D1 integration step can run automatically; current CI reports this step as skipped because those secrets are absent.

### 3. Payments and financial operations

- [ ] Keep Safepay disabled until the exact merchant product's sandbox contract is confirmed and the full checkout → webhook → order → financial ledger flow is tested.
- [ ] Before live Safepay enablement, implement durable event inbox/queue acknowledgement and asynchronous reconciliation; current webhook processing is synchronous.
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

## Read-only production configuration snapshot — 19 November 2026

These are verified release blockers, not permission to change live resources:

- Cloudflare Pages currently exposes only the `deverve-official.pages.dev` domain; no custom domain is connected.
- Pages source deployments and production deployments are disabled in the current project configuration. A production rollout therefore remains a separately authorized operation.
- The production D1 database does not yet contain the AI task-continuity tables from migration 0036.
- No Cloudflare Queue currently exists in the connected account, so the asynchronous Safepay queue/consumer path is not activated.
- The current Pages production configuration does not list Safepay, Resend, WhatsApp Cloud API or Turnstile provider bindings. Provider credentials and account-side verification remain owner setup gates.
- A read-only production count check found existing catalogue and business records; do not seed, overwrite or publish catalogue data without the owner's approved source data.
- No production deployment, D1 migration, secret change, queue creation or live data write was performed during this audit.

## Latest automated verification

- Tested PR head: `e78dd5d2ceaceaeaba09e9b09448888046e58fd8` (audit/test branch only).
- GitHub Actions run: [#1333](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44587927206) — successful.
- Worker tests: 88 passed; browser suite: 82 passed, including the 100-image desktop/mobile intake test.
- Schema smoke check: 36 migrations, 53 tables, constraints and foreign keys verified.
- The CI remote-D1 step was skipped because GitHub Actions does not have `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; migration 0036 was separately tested through the connected Cloudflare account on a temporary D1 database and that database was deleted afterward.
## Current branch and release boundary

- Repository: `Nabeelwasti/Deverve-Official`
- Working branch: `feat/ai-owner-command-execution`
- Pull request: #5
- Production branch: `main`
- No merge, production migration, secret update or production deployment is authorized by this checklist.
- Production deployment requires the owner's separate explicit instruction: **Deploy now**.

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
