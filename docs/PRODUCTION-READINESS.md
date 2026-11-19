# Current source and production data-protection review — 18 November 2026

## Active hardening work — 19 November 2026

- **Work branch:** `fix/variants-camera-multilingual`; draft PR [#3](https://github.com/Nabeelwasti/Deverve-Official/pull/3), based on main commit `0bfd7141de2ec69e56a7245748cd4ec0cefeab0c`. Keep unmerged until the latest CI passes and acceptance checks are complete.
- **Variant inventory:** each purchasable size/colour combination is a separate variant with its own SKU, barcode and stock ledger. The storefront supports choosing either dimension first and moves to an available matching combination. Out-of-stock options are disabled. Legacy variants containing multiple sizes/colours under one shared stock balance must be reconciled and deactivated before a new per-combination matrix can be generated; this avoids silently duplicating aggregate stock.
- **Bulk matrix:** one authenticated, same-origin endpoint validates up to 100 combinations and saves variant rows, opening stock movements and audit entries in a single D1 transaction. A failed transaction rolls back the batch; the admin retains the entered matrix for correction/retry.
- **POS stock concurrency:** POS sale creation now guards the initial sale insert with one D1 statement requiring every selected, published, active variant to have sufficient unreserved stock. Dependent sale lines, stock decrements, inventory movements, payments, ledger entries, audit records and receipt-outbox rows are conditional on that guarded sale existing. A failed stock guard returns a conflict without creating a sale or financial records. The guard has a Worker unit test, and stock decrements update the variant timestamp. This still needs a full integration test against a real D1 database before release.
- **Concurrent duplicate protection:** a read-only production D1 query found no duplicate active single-option size/colour combinations. Migration `0034_unique_active_variant_options.sql` adds a case/whitespace-insensitive partial unique index for active single-option variants while excluding legacy multi-option rows. The migration is in this branch only and has **not** been applied to production.
- **Camera scanner:** bundled ZXing is the cross-browser fallback; native BarcodeDetector is optional acceleration. Scanner unmount stops decoding controls, animation frames and camera tracks. Product-photo decoding falls back to HTMLImageElement where createImageBitmap is unavailable. Browser simulation is not proof of physical-device camera permission, focus, lighting or QR/barcode detection.
- **AI language:** the support prompt follows the latest customer message and writing system. A deterministic signal strengthens Urdu-script and Roman Urdu handling. AI responses still require real-provider acceptance tests in Urdu script, Roman Urdu and English; the prompt cannot guarantee perfect model compliance.
- **CI status:** check the latest PR-head run before merge. Earlier runs against intermediate commits are not evidence that the current PR head passed. A successful build and browser suite do not replace a real-origin smoke test or device testing.
- **Deployment restriction:** no Cloudflare API, Wrangler, Pages deployment, production migration or live-data mutation was performed for this work. Keep the PR unmerged and do not deploy until the owner explicitly says **“deploy now”**.
- **Remaining owner/operations acceptance:** verify live product and vehicle details, approved prices and policies; configure and test approved payment, email, Meta and WhatsApp providers; verify Google Business Profile and domain; complete independent encrypted backup/restore drills; test real customer checkout, stock reservation/release, refunds/returns and rental document handling on the production origin after an explicitly approved release.


## Latest production reconciliation — 18 November 2026

**This section is the authoritative current status and supersedes conflicting migration, deployment, and dependency notes in the historical audit snapshots below.**

- **Source:** `main` at `591756e583cfe8c3094138dd02517ae699c9f827` at the time of inspection.
- **GitHub CI:** run [44365975059](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44365975059) completed successfully. TypeScript/build, Worker type-check and authentication tests, D1 schema validation, security-header checks, production dependency audit and all **64 browser tests** passed. The full dependency audit and production-only audit both reported zero vulnerabilities in this run.
- **Cloudflare Pages:** project `deverve-official`, production branch `main`, build command `npm run build`, output `dist`. The GitHub integration had automatic deployments disabled. This was corrected by enabling `production_deployments_enabled=true` and `deployments_enabled=true`; preview deployments remain disabled. Normal commits to `main` now trigger production builds. No deployment was triggered by changing this setting alone.
- **Latest deployment at inspection:** Cloudflare reports successful build and deploy stages for commit `591756e583cfe8c3094138dd02517ae699c9f827`, deployment ID `e1f1c7b8-063b-4fa6-8419-699c44250cc8`. That deployment was an ad-hoc/manual trigger, not a GitHub push deployment. The next normal commit to `main` is the verification of the automatic release path.
- **Production D1:** read-only inspection returned 60 tables. Verified `enquiries.contact_type` (0028), `enquiry_email_queue` (0029), `pos_receipt_outbox` and its due index (0030), `idx_enquiry_email_queue_lease` (0031), the permanent CNIC triggers (0032), and `notification_outbox.processing_started_at` plus `idx_notification_outbox_lease` (0033). These live objects show the relevant 0028–0033 migration changes are present. There is no migration-ledger table; future reconciliation must inspect schema objects. No migration was applied during this audit.
- **Permanent CNIC evidence:** D1 contains enabled `trg_rental_documents_no_delete` and `trg_rental_documents_no_update` guards. R2 bucket `deverve-media-private` has enabled lock rule `deverve-rental-cnic-indefinite`, prefix `rental-private/`, condition `Indefinite`. No CNIC records or objects were changed.
- **Domain:** Cloudflare currently lists `deverve-official.pages.dev` as the project's Pages domain. No custom domain is configured in the project.
- **Not yet accepted:** a real-origin customer/admin smoke test and business transaction acceptance still need to be run after the next normal GitHub-triggered release. Provider credentials/template approvals, verified product and vehicle catalogue data, owner-approved legal/business details, and an independent off-account backup/restore drill remain owner/operational tasks.

**Data safety:** this audit made no changes to customer, order, rental, inventory, finance, or CNIC data and applied no D1 migrations.


**Latest source:** `0fefa17d2ceeace9bcbef42339c58f386f392bc6`. The latest full code-validation run [44324552622](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44324552622) completed successfully: TypeScript/build, Worker authentication tests, D1 schema validation, security-header checks, production dependency audit and all **58 desktop/mobile browser tests** passed. The new regression checks verified the De VERVE PNG logo is embedded in DOCX/XLSX exports and that JPG exports download successfully. Documentation-only run [44325294013](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44325294013) is pending. This verifies source and browser behavior, not a live Cloudflare deployment.

## Connected business cloud storage

- Dropbox connection verified as account display name **Deverve**, email `deverve61@gmail.com`.
- Created root folder `/De VERVE Business Vault` with ten category folders for encrypted CNIC evidence, encrypted database backups, finance, HR, inventory, customers/orders, legal, marketing, system backups, and operations.
- The root folder has no direct shared links in the current listing. No business files or CNIC evidence have been uploaded yet.
- The website's cloud backup links are guidance only: there is no Dropbox or Google Drive OAuth integration or unattended upload.
- Google Drive's ChatGPT connector is disabled by the workspace administrator. The owner can still use Drive directly in a browser under the same email, but this workspace cannot access it.
- Upload CNIC evidence to the Dropbox CNIC folder only as client-encrypted `.dvbackup` files. Do not upload raw CNIC images or decrypted recovery ZIPs. Keep passwords separately.


## Google Drive backup workflow — added to source

- The admin CNIC backup control now identifies the owner-designated storage account `deverve61@gmail.com`, links to Google Drive and explains the manual upload procedure.
- The app creates client-side encrypted `.dvbackup` files; upload the encrypted file, never the decrypted recovery ZIP or an ordinary CNIC image.
- Google Drive upload is currently a manual owner action. No Google OAuth client, Drive API integration, unattended upload or scheduled Drive sync has been configured.
- The ChatGPT Google Drive connector is disabled by the workspace administrator, so ChatGPT cannot directly upload to that account from this session.
- Detailed owner steps, folder structure, D1 export guidance, password custody, recovery limits and restore-drill checklist are in [docs/SECURE-BACKUP-OPERATIONS.md](SECURE-BACKUP-OPERATIONS.md).
- Local backup artifacts are excluded from Git via `.gitignore`.

**Important recovery boundary:** the CNIC recovery control decrypts and downloads the original images and a manifest in a ZIP. It does not reinsert images or records into production D1/R2. The D1 export process is separately documented and does not include R2 image bytes. A tested replacement-system import process remains required.

## Branded document export coverage

- The shared export engine now embeds the De VERVE logo as a real PNG image in generic Word (DOCX), Excel (XLSX) and JPG/PNG image exports used by the admin, inventory and POS workspaces.
- Spreadsheet export reserves a clean logo header area and uses a valid drawing relationship; Word export embeds the logo media and relationship; image exports draw the logo into the canvas.
- Browser regression coverage verifies the embedded image entries in DOCX/XLSX and successful JPEG output. The 58-test browser suite passed in run 44324552622.
- CSV remains text-only by design because the CSV format cannot contain embedded images. Browser print/PDF uses the relevant workspace's print template.

## Dependency security status

- Production dependency audit: **0 vulnerabilities** in the successful run.
- Full development-tool dependency audit still reports four high-severity transitive findings in build tooling (`fdir`, `picomatch`, `tinyglobby`, and `vite`). They are development/build dependencies, not production runtime dependencies. Keep the audit artifact and reassess after upstream fixes; do not force a major downgrade simply to make the count disappear.
- Vite's dev server must remain local and must not be exposed to the public internet. Production build output is static and does not run the Vite dev server.
## Release and deployment controls

No Cloudflare Pages/Workers deployment, Cloudflare API mutation, production D1 migration, data import, data deletion or R2 object deletion was performed for the Google Drive workflow change. Normal commits to `main` now trigger Cloudflare Pages production deployments; preview deployments remain disabled. The latest live D1 inspection confirms the relevant 0028–0033 schema objects are present, as detailed in the current reconciliation section above. Migration `0032` remains the verified production CNIC immutability safeguard.

---

**Source:** application changes through `e9ecfee57fd524ecf48dc0fe3812807b5cc59dcb`; the latest documentation updates are on `main`. CI for the new encrypted-backup/Code 128 changes must be checked before release. GitHub Actions run [44298634220](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44298634220) passed the complete build job, including dependency audit, TypeScript/build, security-header output, Worker authentication tests, D1 schema checks, Chromium installation and storefront browser tests.

## Live Cloudflare verification — read-only inspection plus one additive safety migration

The Cloudflare account was inspected directly on 18 November 2026. No Pages deployment, Worker deployment, D1 export, data import, data deletion or R2 object deletion was performed.

- **Production D1:** `deverve-production`, production storage backend, APAC primary, 57 tables, approximately 1 MB reported database size. Cloudflare's metadata endpoint reports 57 tables; the earlier `num_tables=0` result was stale/inconsistent and must not be relied upon.
- **Existing rental evidence:** one rental request and two `rental_documents` records were present before and after the safety change. A read-only R2 object listing confirmed exactly two matching objects under `rental-private/`; both object keys matched the D1 metadata and both object byte sizes matched the D1 `byte_size` values (71,510 bytes total). No document IDs, customer identity details or object keys are copied into this report.
- **CNIC database protection:** production initially had no CNIC protection triggers. The exact additive SQL from `migrations/0032_permanent_cnic_evidence.sql` was applied directly to production D1. Read-back confirmed both `trg_rental_documents_no_delete` and `trg_rental_documents_no_update`. A harmless no-op metadata update against an existing document was rejected by the new trigger, and the document count remained two. The existing migration also protects parent rental deletion through the child-row cascade trigger. No CNIC document was deleted or modified.
- **Other pending migrations:** `0030_pos_receipt_delivery.sql` and `0031_enquiry_email_queue_lease_index.sql` remain unapplied to production. They must be applied in the planned release sequence before deploying the matching receipt/email code. Migration 0032 is the only one of these three applied directly as an isolated evidence-protection safeguard.
- **Private R2 bucket:** `deverve-media-private`, Standard storage, APAC location. Its managed public `r2.dev` domain is disabled and no custom public domains are configured.
- **R2 CNIC retention:** Cloudflare read-back confirmed the enabled rule `deverve-rental-cnic-indefinite`, scoped to `rental-private/`, with condition `Indefinite`. Cloudflare documents that this protects both existing and future matching objects from overwrite and deletion, including lifecycle deletion. The only current lifecycle rule aborts incomplete multipart uploads after seven days; it does not expire completed CNIC objects.
- **D1 recovery:** D1 Time Travel is enabled automatically. On the Workers Free plan the documented point-in-time recovery window is seven days. It is useful for accidental SQL changes, but it is not a long-term archive and does not back up R2 images.
- **Offline backup control:** the admin rental workspace now offers per-rental encrypted `.dvbackup` export and local file recovery. It uses browser-native PBKDF2-SHA-256 (310,000 iterations) and AES-256-GCM, includes an authenticated encryption tag, validates file types/sizes and verifies image lengths on restore. It sends no CNIC image to a third-party service and stores no backup password. The owner must choose a strong password, keep it separately, and save each backup outside the Cloudflare account (for example, an encrypted offline drive or an independently controlled storage account). This is a manual export, not a scheduled automatic backup. A second copy and a documented restore drill are operational requirements. The automated browser regression test now exercises encrypted backup creation and restore using valid PNG bytes; the GitHub Actions result for the latest test changes is still pending verification.

## Current security boundaries and next technical work

1. Keep CNIC originals in the private R2 bucket under `rental-private/`. Never place them in public media, public website paths, AI Search indexes, analytics, logs, GitHub, email attachments or public share links.
2. Keep CNIC preview/download behind authenticated, role-checked server routes. Use short-lived, single-document access grants where direct R2 access is needed; do not make the bucket public. Audit every staff preview/download event without logging the CNIC number, image bytes or full object key.
3. Add an automated, scheduled D1 SQL export to a separate locked R2 backup bucket using Cloudflare Workflows, with checksums, retention manifests and restore drills. The backup must be encrypted and must not silently overwrite older snapshots. Workflows is available on Free, but its free execution, step and storage allowances are finite; check usage before enabling schedules.
4. Add an independently encrypted off-account copy for CNIC originals. A second bucket in the same Cloudflare account is useful for operational recovery but is not an independent disaster-recovery copy.
5. Keep production migrations additive and reviewed. Do not apply 0030/0031 until their release sequence is ready; do not deploy until the owner explicitly says **“deploy now”**.
6. Native Code 128 label generation is now available in Admin → Inventory. Labels encode the saved barcode, or the SKU when no barcode is set; POS lookup already matches both barcode and SKU. The Code 128 symbol table is checked into the application and contains 107 validated patterns. Camera scanning uses the browser's native `BarcodeDetector` API, with USB scanner and manual search fallbacks. It does not yet include a bundled open-source camera decoder for browsers without `BarcodeDetector`.
7. Do not treat OCR as identity authentication. OCR can read fields and flag mismatches, but cannot prove a CNIC is genuine. A genuine check needs an authorized NADRA verification channel or trained staff process. Cloudflare does not provide a CNIC authenticity or face-recognition verification service.
8. Any selfie/liveness or face comparison must be optional only where legally justified, based on explicit informed consent, minimized retention, strict staff access and a manual alternative. Do not create or retain face templates merely because an AI model can compare images.

## Document and report branding status

The POS print invoice already displays the De VERVE logo. The POS invoice, rental request summary printout and barcode label print sheet use the actual De VERVE logo asset. Generic Word/Excel/JPG report exports retain a text-based De VERVE brand lockup; actual embedded logo imagery across every Office export remains outstanding. CSV is text-only by format. Browser print-to-PDF retains the branded source document where the workspace supplies it. Preview/print-to-PDF, Word, Excel, CSV and JPG availability varies by workspace; do not claim every document type supports every format until each export path is verified.

## Cloudflare free-tier options relevant to this application

- **R2:** the documented Free allowance is 10 GB-month Standard storage, 1 million Class A operations and 10 million Class B operations per month, with free internet egress. The allowance is shared across the account.
- **D1:** Free limits include 500 MB per database, 5 GB aggregate storage and seven days of Time Travel recovery. Use indexes and monitor daily row-read/write quotas.
- **Turnstile:** Free plan supports production use and unlimited challenge/verifications within the published plan, subject to widget/hostname limits. Keep server-side Siteverify mandatory for sensitive writes.
- **Workers/WAF:** Free WAF features include custom rules and one rate-limiting rule; use the available controls without assuming paid managed rules or advanced bot detection.
- **Workflows:** available on Free, with finite daily execution/step and persisted-state allowances. Suitable for retryable D1 exports and scheduled integrity checks when usage is monitored.
- **AI Search OCR:** OCR is available, but it is a searchable-content ingestion feature, not a private CNIC verification service. Do not send identity documents into a search index.
- **Workers AI / AI Gateway / Queues / Cron Triggers / Analytics Engine:** useful for selected automation, non-sensitive AI assistance, asynchronous processing and operational metrics. Never send CNIC images or biometric data to these services by default.

**Release verdict:** CI must pass on the current source commit before this change is considered verified. Live CNIC database triggers, indefinite R2 retention and object-to-record integrity are verified. A browser-native encrypted per-rental backup/restore tool and native Code 128 inventory labels have been added to source. Remaining gates include a tested owner-controlled off-account backup/restore drill, D1 long-term export, 0030/0031 release migrations, universal actual-logo embedding in Office exports, camera scanning on real Android devices, owner/legal approvals and live business data acceptance. No deployment has been performed.


---

# Current release verdict — 15 November 2026

**Verdict: the technical platform is deployed, but unrestricted live commerce is not yet certified.**

## Verified release state
- Payments, promotions, owner-notification and exchange-policy hardening merged into `main` at `4feb999f0332a6ef5234bb9a6faf985c94268b78`.
- Dedicated customer/admin exchange case management was added directly on `main` in `51f693f52a3185e0696a04d6acb74b6f186cd4e3` and `cd93fdcd0cf8d464b0d0c88c46ede523451ebcb5`. It includes request items, status history, staff transitions and customer tracking.
- The exchange eligibility window was hardened to use the latest delivered status event rather than the order's generic last-updated timestamp. Regression tests cover the exact seven-day boundary, expired/future values and invalid timestamps.
- Main commit `ec367c3c9caa19bf19ce68ff7d9d990f10c771c1` passed CI run #428 (`43733696484`). The exchange delivery-window fix, regression test and exchange-aware production smoke workflow also passed CI runs #429–#434; latest CI run #434 (`43736877794`) passed all 13 steps. Latest production smoke run #147 (`43736962128`) passed all eight steps, including real-origin health/D1 connectivity, unauthenticated exchange endpoint protection, CMS/sitemap, Turnstile, CNIC service bindings and deployed security headers.
- Cloudflare Pages is connected to `Nabeelwasti/Deverve-Official` on `main`. The Pages project reports deployment `15405b50-0b40-4111-bd0c-7a4c0c217cdd` for commit `8777f4e86b7a027f95c3d812564db3a11035ef96` as successful. Later documentation commits can trigger a newer deployment.
- Production D1: `deverve-production`, ID `355da876-17c4-4762-a59d-bb85f2e4551b`; private R2 binding `deverve-media-private`.
- Production D1 contains promotion columns from migration `0017_single_promotion_per_order.sql` and all three exchange tables from `0018_exchange_case_management.sql`. Direct `sqlite_master` queries confirm the exchange tables. There is no migration-tracking table; production migrations must be verified by direct schema inspection. Current table count: 45.
- Production data snapshot: 1 active owner, 3 media assets, 0 products, 0 variants, 0 vehicles, 0 customers, 0 orders, 0 rental requests, 0 exchange requests and 0 CMS pages.
- Turnstile verifier Worker has its secret binding. CNIC-retention Worker has D1/R2 bindings and a daily schedule, but its current code only expires temporary upload tokens; it does not delete stored CNIC objects. The production upload setting must be owner-reviewed before use.
- Pages production variables currently expose only `ADMIN_BOOTSTRAP_TOKEN`; Safepay and Resend credentials are not configured. COD is the default until the owner activates direct payment methods.
- Owner-only Website Settings now manages up to 12 direct payment methods: COD, bank transfers, wallets (e.g. SadaPay/JazzCash/Easypaisa), hosted HTTPS payment URLs and QR images. The owner can upload a QR image, enter account title/bank/account number/IBAN/instructions, and activate or disable each method. Only active methods are returned to the public checkout.
- Direct-transfer orders store the selected method and stay pending. Only the absolute owner can manually verify receipt; fulfilment is blocked until the payment is verified. This is manual reconciliation, not an automatic bank or wallet API connection.
- Safepay adapter code supports sandbox and separately gated production, but no merchant credentials or successful sandbox transaction are present. Safepay API secrets are not yet editable in the owner dashboard. A provider-supplied hosted HTTPS link can be published as a manual method while dynamic per-order checkout remains pending integration and onboarding.
- PayFast is not integrated as a dynamic per-order gateway. Obtain the merchant-specific hosted OneCheckout contract and credentials before implementation. Never collect PAN/CVV on De VERVE pages.
- No owner notification recipient is configured by default. The owner must set a business-owned primary inbox in Admin before alerts/enquiry emails can be sent; Resend also needs a verified sender domain/address and API key.
- The in-site exchange workflow is implemented, but no production exchange cases exist. Real order/item/stock acceptance tests still require actual business data.
- Direct HTTP checks from this assistant's verification environment are blocked with a tool-side 403. GitHub-hosted production smoke workflows can reach the real origin; rely on their results for public endpoint and response-header verification.

## Remaining launch blockers

| Priority | Blocker | Required closure |
|---|---|---|
| Critical | No live catalogue or fleet data | Owner/staff must enter verified products, variants, sizes, colours, retail/wholesale prices, physical stock, genuine photos, vehicles, rates and availability. |
| High | Direct payment activation | Owner must enter verified bank/wallet details, hosted links and QR images in Website Settings, then test customer display and manual reconciliation. |
| High | Gateway onboarding | Configure Safepay sandbox secrets, run an actual sandbox payment and webhook reconciliation, then complete provider live approval before enabling production. Obtain PayFast's official hosted OneCheckout contract before implementing it. |
| High | Email delivery | Verify a sending domain, add Resend API key and sender address as Cloudflare secrets, then test delivery and retry handling. |
| High | Business/legal data | Owner must approve contact details, delivery coverage/fees, wholesale minimums, rental terms, exchange terms, privacy notice and CNIC-retention wording. |
| High | Account lifecycle | Customer email verification and email-based password recovery are not active. |
| Medium | Exchange fulfilment | Portal case management exists; staff must confirm replacement inventory and record the real receipt/completion steps. |
| Medium | Domain and acceptance | Owner must provide a domain and DNS access if a custom domain is required; complete real-device customer/admin tests against production D1/R2. |
| Contained | CNIC collection | Keep disabled until owner-approved retention policy and a real scheduled deletion test are complete. |

Do not mark the site unrestricted-commerce-ready while these blockers remain. Do not invent business data, provider credentials, domain ownership or customer records.


---

# De VERVE production-readiness report

Audit baseline: 9e5ac6bfbc45e455d770405b016c17b395538a3a

## Latest verified release snapshot

- Application commit: `25c9c408bc8221bf5f4121d89e6f7a4b3b9484fc`
- GitHub Actions run #263: passed frontend/Worker type checks and build, published-header file check, all 21 Worker tests, D1 schema validation (11 migrations / 28 tables), and four Playwright browser tests across desktop Chromium and Pixel 7 emulation: https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43684699340
- Cloudflare Pages deployment for the same commit: `787b7585.deverve-official.pages.dev`, all reported stages successful.
- Post-deployment smoke run #1 passed against the production hostname: `/api/health` returned `status=ok` and `database=connected`, and all configured security response headers including CSP were present: https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43684727845
- Production D1 contains the public rate-limit table and delivery-fee approval columns; migrations 0010 and 0011 are applied.
- Direct production D1 counts at this verification: 0 products, 0 variants, 0 vehicles, 0 orders and 0 rental requests; 1 owner admin account and 3 media assets. The official-logo media asset and favicon are selected in public brand settings.
- Playwright now exercises the built storefront in desktop and Pixel 7 browser profiles. Enquiry and rental API responses are mocked, so these tests verify the frontend journeys only; they do not create production enquiries/bookings or validate the live D1/R2 integration. A real customer-device journey and live D1/R2-backed transaction testing still require independent verification. The deployed health endpoint and response headers are now verified automatically after successful CI.

Status: technically improved; not certified for unrestricted production commerce.

## Changes in this release

- Rental datetime-local values are parsed explicitly as Pakistan Standard Time (UTC+05:00), validated as real calendar dates, and stored as UTC ISO timestamps. Explicitly zoned ISO timestamps remain supported.
- Regression tests cover Pakistan UTC+05:00 conversion, seconds, explicitly zoned input, impossible dates, and malformed timezone-less input.
- Cloudflare Pages security headers are defined in `public/_headers`, which Vite copies into `dist/_headers`; CI asserts the file is present in the published build. The post-deployment smoke workflow verifies CSP, frame restrictions, MIME sniffing protection, referrer policy, permissions policy, and HSTS on the production response.
- A minimal robots policy and canonical sitemap are included for the current production hostname.
- Atomic D1-backed fixed-window limits protect public enquiries, COD checkout, rental requests and CNIC uploads. Only a SHA-256 digest of the Cloudflare client IP plus endpoint scope is stored; raw IP addresses are not persisted. Limits fail closed if the rate-limit store is unavailable. Local development without the Cloudflare edge IP header skips the limiter.
- Retail COD orders start with a pending delivery quote. Staff can set the fee and create a 48-hour customer approval link. Customers can accept the final total or decline; declining cancels the order and releases stock reservations. Processing and dispatch are blocked until acceptance. Quote, acceptance and decline decisions are recorded in the order audit history.
- README security and launch-gate statements are updated.

## Remaining release blockers

| Priority | Finding | Why this prevents an unconditional certification | Required closure |
|---|---|---|---|
| High | Public form/API abuse controls | Atomic D1 fixed-window limits now protect enquiries (8/15 min), checkout (5/15 min), rental requests (5/15 min), and CNIC uploads (3/15 min) per Cloudflare client IP. This reduces single-source abuse but does not stop distributed botnets or replace a challenge. | Configure and verify server-side Turnstile (site and secret keys), add periodic expiry cleanup for stale buckets, and test distributed traffic. |
| Contained by default | CNIC retention and deletion policy | Public CNIC uploads are now disabled by default; rental requests do not receive upload tokens unless `CNIC_UPLOADS_ENABLED=true` is configured. No identity documents are accepted while the retention policy is unresolved. | Owner must approve retention period, customer notice/consent text, access policy and automated purge schedule before the flag is enabled. |
| Closed in code | Delivery fee finalization | Staff can set the fee in the admin order card and share a 48-hour approval link through WhatsApp. Customers see subtotal, fee and final COD total, then accept or decline. Declining cancels the order and releases reserved stock. Processing and dispatch are blocked until acceptance. | Complete browser-level customer and admin testing on the live site. |
| High | Real catalogue and fleet data | Production database currently has no published products/variants/stock or available vehicles. | Enter verified products, prices, sizes, colours, stock, vehicle data, rates, and real photos. |
| High | Business identity and legal content | A logo asset and favicon are uploaded and selected, but the owner must confirm they are final approved versions. Verified contact details, returns/exchange terms, delivery coverage, wholesale terms, rental terms, business hours, and privacy notice still require owner confirmation. | Confirm and publish accurate business information and policies. |
| Medium | End-to-end verification | Worker tests use a fake D1 implementation. Playwright covers public enquiry and rental form interactions on desktop and Pixel 7 emulation with mocked API responses; it does not yet verify real D1/R2, checkout, staff invitation, media, wholesale, or CNIC workflows. | Add isolated Cloudflare-compatible integration tests and complete real-device customer/admin acceptance checks. |
| Medium | Customer lifecycle | Customer registration/sign-in, secure sessions, profile/password changes, account-scoped order/rental history and order-status timeline are implemented. Email verification, email-based password recovery, returns/refunds automation and transactional notifications are not connected. Safepay sandbox adapter code is present but disabled because no sandbox credentials are configured; no real payment has been tested. | Advertise only the working account and tracking functions. Do not claim email verification, password recovery, online payment or automated refunds. |
| Medium | Domain and SEO | The site uses the shared Pages hostname. Product detail views are not dedicated indexable product URLs. | Connect the business domain and later add canonical product routes, structured data, and per-product metadata. |

## Explicit operating boundaries

- Cash on Delivery is the only currently available checkout method. A Safepay Express Checkout sandbox adapter, signed webhook verification and server-side amount reconciliation are implemented but remain dormant until all three sandbox secrets are configured. No real sandbox transaction has been completed; live payments are not enabled.
- Social profile URLs are display links only. OAuth, publishing, inbox management, ads, and social analytics are not implemented.
- No email sending domain or transactional notification provider is configured.
- No products, vehicles, reviews, or business claims should be fabricated to make the storefront look populated.
- The new CSP must be checked on the deployed site, including PWA installation, Google Fonts, media previews, admin forms, and future third-party integrations.
- HSTS intentionally omits includeSubDomains because the current host is pages.dev, a shared domain.

## Verification required after deployment

1. GitHub Actions: build/type checks, all 27 Worker/CNIC tests, 12-migration / 36-table schema checks, and four desktop/mobile Playwright storefront tests pass on the release commit.
2. Cloudflare Pages deployment for that exact commit reports success.
3. Live /api/health returns a healthy database response.
4. Live response headers include the intended CSP and security headers without breaking assets or application behavior.
5. Test a rental booking with a Pakistan-local future time and confirm the stored UTC timestamp is correct; test past, invalid, and overlapping bookings against an isolated D1 environment.
6. Complete real-device journeys for retail COD, stock reservation/release, wholesale approval, admin roles, media access, and rental document controls.
7. Close every owner/business dependency above before claiming unrestricted launch readiness.

Verdict: The code can be deployed and technically smoke-tested, but a 100% production-ready certification is not defensible while the listed security, data, policy, and real-world acceptance gates remain open.

## Follow-on implementation snapshot — 15 November 2026

- Turnstile widget created for deverve-official.pages.dev in managed mode. Its secret is stored in the separate deverve-turnstile-verify Cloudflare Worker as a secret binding. The Pages Worker calls this verifier for enquiry, checkout, rental and CNIC upload writes. The verifier requires the expected Pages hostname and Cloudflare Siteverify success.
- The storefront now includes bilingual English/Urdu policies for orders/payment, delivery, returns/complaints, wholesale, rentals, privacy and CNIC handling.
- Owner-controlled CNIC uploads setting added to Admin → Website & brand settings. It defaults to disabled. Upload requests are only accepted when enabled, and closed/cancelled rental requests cannot accept late document uploads.
- A deverve-cnic-retention scheduled Worker is configured with the production D1 and private R2 bindings, running daily at 03:00 UTC. Its current source clears expired one-time upload tokens only. It does not purge stored CNIC documents or implement the previously documented 30-day deletion rule. Owner-approved retention wording and a separately verified deletion implementation are required before CNIC uploads are enabled.
- GitHub Actions run #268 passed build/type checks, Worker tests, schema validation and four desktop/mobile Playwright tests with a mocked Turnstile script and mocked APIs. This proves integration wiring and form behavior only; it does not prove real challenge verification or live order/payment transactions.
- Later commits adding the bilingual policy page and owner CNIC setting are still awaiting the latest CI run and post-deployment smoke check at the time this note was written.

### Remaining work and external dependencies

- Email verification and secure password recovery require a transactional email provider; the current account flow clearly discloses that these are not active.
- Safepay sandbox end-to-end verification requires an owner-controlled sandbox merchant account, test keys and webhook shared secret. Live payments still require Safepay merchant onboarding, live credentials, live webhook setup, refund handling and reconciliation.
- A Pakistan-supported payment provider, merchant approval, sandbox/live credentials, signed webhooks, refunds and reconciliation.
- Transactional email domain/provider and templates.
- SMS provider and WhatsApp Business Platform account, approved templates and message pricing.
- Real D1/R2 integration tests, actual Turnstile challenge tests, real-device acceptance and the first scheduled CNIC cleanup verification.
- Owner confirmation/legal review of the public policy wording, especially returns/exchanges, rental deposits, cancellation, liability and document retention.
- Verified products, variants, stock, fleet and prices remain intentionally empty until the owner adds them.

**Current verdict: not yet certified for unrestricted production commerce.** The free Cloudflare Pages hostname and free hosting remain suitable for the current build stage; a custom domain is optional, not a blocker.

## Verification notes — 15 November 2026

- Production smoke run #30 passed: live Pages health and D1 connection, Turnstile verifier health and secret binding, a negative Siteverify request (invalid token rejected), CNIC retention worker health with D1 and private R2 bindings, and deployed security headers.
- The CNIC retention Worker source is maintained at workers/deverve-cnic-retention.js; its health endpoint is checked in production smoke. Unit coverage is in scripts/cnic-retention.test.mjs. The cron trigger is 03:00 UTC daily. Its health response explicitly reports automatic_document_deletion=false; only temporary upload-token expiry is implemented. No automatic CNIC object deletion is verified or claimed.
- The Turnstile verifier source is maintained at workers/deverve-turnstile-verify.js. The actual successful human challenge path has not been exercised in an end-to-end live browser test; automated browser tests use a mocked widget callback.
- Production D1 currently has no CNIC upload setting row (so the application default is disabled) and zero rental documents. No customer orders, products, variants or vehicles were created as test data.
- A clear 7-calendar-day return request window and 7-working-day approved refund processing target are now disclosed in both languages. Owner/legal review is still recommended before accepting paid orders.


## Release verification update — 15 November 2026

- Commit `ac42386b4fbc59f03906fd654e7256f39d911d00` passed CI run [#43703808674](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43703808674): TypeScript/Vite build, Pages security-header artifact check, 27 Worker/CNIC tests, 12-migration / 36-table schema verification and four desktop/mobile Playwright tests.
- Production smoke run [#43703905158](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43703905158) passed live Pages/D1 health, Turnstile verifier/Siteverify negative test, CNIC-retention bindings and deployed security headers.
- The additive migration `0012_customer_payments_notifications.sql` was applied to production D1 after a database export. Read-back confirmed all eight new tables and preserved the single owner account, three media assets and zero catalogue/order/rental records.
- Customer accounts are available at `/account`: Turnstile-protected registration, password sign-in, HttpOnly/Secure/SameSite=Strict 30-day sessions, profile editing, authenticated password changes, account-scoped order/rental history and order progress events.
- New COD orders and rental requests are associated with the currently signed-in customer. Historical guest orders are not auto-linked by email, to avoid account-takeover/IDOR risks.
- Email verification and email-based password reset are intentionally not offered until an approved transactional email sender is configured. The account page warns customers of this limitation.
- The follow-on order-status timeline commit `df2832b01a70a2b40cb03e910394b087e0df4fed` passed CI run [#43704058411](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43704058411) and production smoke [#43704125125](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43704125125).
- Production still has one admin owner, zero customer accounts, zero products, zero vehicles, zero orders and zero rental requests. No real customer or business data was created for tests.

The site is still **not certified for unrestricted production commerce**. Safepay sandbox credentials and end-to-end transaction tests, live merchant onboarding, email/SMS/WhatsApp delivery, automated refunds, owner/legal return-policy approval, real-device business acceptance, legal/policy approval and owner-supplied inventory/fleet data remain open.


## Safepay sandbox adapter — 15 November 2026

- Added a server-side Safepay Express Checkout adapter restricted to the sandbox host `https://sandbox.api.getsafepay.com`.
- The storefront asks the backend whether online payment is available. It only displays the sandbox option when `SAFEPAY_ENV=sandbox` and the three server-side secrets are present.
- Online orders require a signed-in customer account. The payment attempt uses the server-calculated final PKR total, and can only start after the customer has approved the delivery-fee quotation.
- Webhooks are verified against the exact raw request body using HMAC-SHA512 and `X-SFPY-SIGNATURE`. Event IDs are deduplicated. A payment is marked paid only when the signed event reports `payment.succeeded`, `TRACKER_ENDED`, PKR and an exact match to the stored order total. Admin fulfilment is blocked until the order is paid.
- Production Pages currently has no Safepay secrets configured, so the option remains hidden and COD remains the only available method. No sandbox or live card transaction has been performed. The adapter has passed unit tests for signature verification, disabled-state behavior, build, Worker tests, schema validation and browser tests.
- Do not add secrets to GitHub source, D1, issues or chat. Add them only through Cloudflare Pages production secret settings after the owner creates the sandbox merchant account. Keep `SAFEPAY_ENV` set to `sandbox`.

- Webhook processing supports retry events for the same Safepay tracker: a `payment.failed` attempt remains retryable, because Safepay documents that a shopper can retry on the same tracker and more than one webhook may be delivered for that tracker. A later signed `payment.succeeded` event can therefore reconcile the same attempt.


## Payment safety verification — 15 November 2026

- Production D1 has the additive `payment_provider` column on orders, defaulting to `manual`; read-back via `PRAGMA table_info(orders)` confirmed it. Existing payment method constraints remain unchanged.
- Payment attempt failure events leave the tracker retryable. A signed `payment.failed` webhook does not permanently close the attempt, so a later `payment.succeeded` event for that same tracker can still reconcile the order.
- Admin cancellation is blocked when a Safepay payment is active or when an order is already marked paid. The database update also repeats the payment-state guard, protecting against a race between webhook processing and cancellation.
- CI run [#43707019218](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43707019218) passed 31 Worker/CNIC tests, schema validation (13 migrations / 36 tables), build/type-check, security-header artifact validation and all four desktop/mobile Playwright tests. The Safepay retry and paid/active-order cancellation regression tests passed.
- Production smoke [#43707104164](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43707104164) passed live Pages/D1 health, Turnstile verifier and negative Siteverify test, CNIC retention bindings, and deployed security headers.
- Live D1 read-back currently shows one admin owner, three media assets, and zero customers, products, variants, vehicles, orders and rental requests. No test customer or order was written to production.
- No Safepay sandbox transaction has been made. The checkout adapter remains dormant until the owner has a sandbox merchant account and the three credentials are installed as Cloudflare Pages production secrets. The integration is not a live payment service and must not be advertised as one.

The deployment is still not certified for unrestricted commerce. Returns/refund workflows, notification delivery, payment sandbox transaction verification, merchant live onboarding, legal/policy approval, owner inventory/fleet data and real-device business acceptance remain open.


## Customer returns and manual refund workflow — 15 November 2026

- Migration `0014_returns_refunds.sql` was applied to production D1 after a complete D1 SQL export finished successfully. The three new tables are `return_requests`, `return_request_items` and `return_status_events`.
- The customer account has a **My returns** area. A customer may request one return per order, only after delivery and within seven calendar days of the delivered timestamp. The customer selects item quantities and a reason; the server verifies order ownership, delivery state, time window, item membership and quantity. Refund estimates use the stored item prices and exclude delivery charges.
- The admin workspace has **Returns & refunds** for owner, manager and orders roles. Status progression is requested → approved/rejected → received → refunded. All transitions are audited.
- Recording a refund requires a manual method (bank transfer, cash or store credit) and a transaction/receipt reference. The system does not send money, create a Safepay refund or mark a refund complete without that reference. Returned stock is not automatically restocked; staff must inspect it and use the normal inventory adjustment workflow.
- CI run [#43708097899](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43708097899) passed 34 Worker/CNIC tests, 14-migration / 39-table schema validation, build/type-check and five desktop/mobile browser test cases, including the customer return journey.
- Production smoke [#43708191784](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43708191784) passed after the final customer/admin return UI deployment, including authenticated customer and admin route checks. The production D1 read-back confirms one owner, three media assets and zero customer, product, vehicle, order, rental or return records.

Automated payment refunds, notification delivery, live payment onboarding, owner/legal review of return policy, and real-device acceptance remain outstanding. The platform is not certified for unrestricted commerce.


## Rental booking hardening — 16 November 2026

- Customer rental submission is now a single multipart request. Both CNIC sides and explicit consent are mandatory; images are validated and stored in private R2 in the same workflow as the rental record. The public flow no longer treats post-request CNIC upload as optional.
- Authorized rental staff can only confirm a rental after both CNIC document records exist. Existing admin document access and deletion permissions remain enforced.
- Vehicle records now support with_driver_daily_rate_paisa in addition to the existing self-drive daily_rate_paisa. Both self-drive and with-driver rates are required before a vehicle can be published as available; the selected mode always uses its own configured rate.
- The customer sees a live estimate based on selected vehicle, driver option and full 24-hour periods rounded up. The Worker independently recalculates and stores rental days, daily rate and total; client-submitted totals are never trusted.
- Production D1 currently has zero vehicle records. Automatic price estimates will only appear after the owner adds vehicles with rates in Admin → Vehicle fleet. With no selected vehicle, the request can still be sent and the team must quote manually.
- Migration migrations/0020_rental_pricing.sql was applied to production D1 after a successful export snapshot. PRAGMA read-back confirmed with_driver_daily_rate_paisa, rental_days, estimated_daily_rate_paisa and estimated_total_paisa. The saved CNIC uploads setting was also read back as true.
- CI must pass build/type checks, Worker tests, schema validation and browser tests. Live acceptance must confirm Turnstile, CNIC R2 writes, admin-only retrieval, confirmation gating, retention cleanup and both pricing modes.


---

## Source readiness checkpoint — 18 November 2026

**Scope:** read-only review of current `main`, Worker entry points, current migration files, customer account UI, AI key manager, backup procedures and the owner handover tracker. No production environment was changed.

### Verified source and CI

- Owner setup tracker commit `5cdec943b8de327f634b30cc74064ad6234f2ca9` passed GitHub Actions [#44341083529](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44341083529).
- README tracker-link commit `b9f1c8ac7ee874e4b6f98d7f0b7976822beaba0f` passed [#44341122641](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44341122641).
- Both runs completed the build/type-check, production dependency audit, Pages security-header artifact check, Worker authentication tests, D1 schema validation and browser tests. This proves the tested source builds; it does not prove the current main commit is deployed or that external services are configured.
- Worker currently has explicit server-side bindings for Safepay, Resend, Gemini keys, and WhatsApp Cloud API. The presence of a binding or delivery queue is not proof of provider credentials, verified sender/phone, approved template or real delivery.
- Customer accounts currently use the native De VERVE password/session system. Google and Microsoft OIDC are not implemented. Google Drive upload is manual; encrypted CNIC recovery downloads a local ZIP and does not restore into D1/R2.
- AI key manager currently manages Gemini keys in a server-side encrypted vault and supports testing/fallback order. Owner must still verify configured keys and approve which data can be processed. Never send CNIC evidence, customer PII, HR, finance or rental contract data to consumer AI providers.

### Release blockers confirmed in source/docs

1. **Database release ordering:** migrations `0030` and `0031` are still recorded as pending production. They must be reviewed against the live migration ledger and backed-up production schema before a controlled release. Migration `0032` is the separately applied CNIC protection safeguard. Do not run migrations or deploy in this task.
2. **Payments:** Safepay adapter is sandbox-only and dormant without the three sandbox secrets; no sandbox transaction has been completed. No live merchant onboarding, live payment or automated provider refund is verified. COD remains the only confirmed checkout path. Do not enable a wallet/payment option based only on a setting label.
3. **Email and WhatsApp:** Resend and WhatsApp outbox processors exist, but provider credentials, sender/domain, WABA/phone ID, approved template and end-to-end delivery remain owner-dependent and unverified. Customer email verification/password recovery are not active.
4. **Backup/restore:** CNIC original retention protection is a hard invariant. Per-rental encrypted backup is manual. Business-wide D1 + R2/media backup, Google Drive OAuth upload, off-account automation and a successful isolated restore drill remain incomplete. D1 export alone does not contain R2 image bytes.
5. **Identity:** Google/Microsoft customer login remains documentation-only. Provider app IDs, exact final hostname and redirect configuration are needed before safely activating identity flows. OAuth must not grant admin access.
6. **AI:** Gemini key manager exists, but active provider health, rate/usage caps, data classification, prompt-injection protections and owner policy approval must be validated before describing public AI chat as production-ready.
7. **Business acceptance:** actual product/variant/stock and vehicle/fleet/rates are intentionally owner-supplied. Legal policy approval, real device tests, operational support and real transaction/notification acceptance are outstanding.

### Safe next-release rule

- Use normal commit messages; automatic production deployment from `main` is enabled.
- Do not call Cloudflare deployment APIs or Wrangler. Do not apply migrations, change secrets, import/delete data or alter R2 objects.
- Before a later release: export and verify D1 backup; reconcile migration ledger; stage migrations `0030` and `0031` in an isolated copy; test all Worker/browser paths; obtain owner/provider approvals; deploy only after the owner explicitly says **“deploy now”**; then run the live smoke and restore/transaction acceptance plan.

**Verdict:** source CI is passing, but the service is **not certified production-ready for unrestricted commerce**. External integrations, backup/recovery, migration release, owner data, legal approval and live acceptance are real blockers—not tasks that can responsibly be marked complete from source code alone.


---

## Production schema reconciliation — read-only audit, 18 November 2026

**Live database:** `deverve-production` (`355da876-17c4-4762-a59d-bb85f2e4551b`). The following checks used read-only D1 metadata and SELECT/PRAGMA queries only. No production data, schema, secrets, R2 objects, or deployments were changed.

### Confirmed findings

- Production contains the existing commerce, customer, rental, POS, inventory, finance, CMS and audit tables.
- `rental_documents` still has the two previously recorded evidence rows; the D1 CNIC protection triggers `trg_rental_documents_no_delete` and `trg_rental_documents_no_update` are present.
- `pos_sales` currently has its original POS columns only. It does **not** contain `customer_email`, `email_receipt_requested`, or `whatsapp_receipt_consent`.
- Production does **not** contain `pos_receipt_outbox`.
- Production does **not** contain `enquiry_email_queue`.
- Production has no migration-ledger table. Migration state must be established by direct schema inspection, not inferred from a missing ledger or old tracker notes.
- These observations establish that migrations `0029_enquiry_email_queue.sql`, `0030_pos_receipt_delivery.sql`, and `0031_enquiry_email_queue_lease_index.sql` are not fully applied. Migration 0031 depends on the queue created by 0029; applying 0031 alone is invalid.

### Required additive release sequence

1. Take a fresh D1 export and verify that the encrypted archive is stored outside the Cloudflare account. Keep a separate recovery copy. Do not use a D1 export as a substitute for R2 evidence backup.
2. Re-check the live schema immediately before release to ensure the three migrations have not already been applied by another operator.
3. Apply `0029` first. Verify `enquiry_email_queue` and `idx_enquiry_email_queue_due`.
4. Apply `0030` second. Verify the three `pos_sales` columns and `pos_receipt_outbox` plus `idx_pos_receipt_outbox_due`.
5. Apply `0031` third. Verify `idx_enquiry_email_queue_lease`.
6. Confirm the two CNIC protection triggers still exist and run only a harmless rejected-operation test against a disposable test record in a non-production database. Never probe by modifying a real CNIC record.
7. Only after schema verification, green CI on the exact release SHA, confirmed backup, owner acceptance of the provider-dependent limitations, and the final deployment authorization should the Pages release be deployed.
8. Immediately after deployment, run the production smoke workflow and targeted enquiry/POS/admin/rental checks. If any critical check fails, stop new transactions and follow the documented rollback plan; do not reverse migrations by deleting business data.

### Feature impact while migrations are pending

- Enquiry creation and POS receipt code in the current source expects these queue/table/column definitions. The provider processors fail closed when queue reads cannot run, but write paths that enqueue messages must be validated against the schema before deployment.
- Do not claim website enquiry email or POS email/WhatsApp receipt delivery is production-ready until the schema is present, provider configuration is verified, and an opted-in end-to-end delivery test succeeds.
- The migration files are additive. The existing records are not to be rewritten or deleted by this sequence.

**Release status after this audit:** production schema reconciliation is now accurately documented. The three migrations remain unapplied; no deployment or production mutation has been performed.


## Owner notification delivery repair — 18 November 2026

A source audit found a real Worker/schema mismatch in `processNotificationOutbox`:

- The processor bound two values to a SELECT statement containing only one placeholder.
- The processor also read/wrote `processing_started_at`, but migration 0012 did not define that column. Production `PRAGMA table_info(notification_outbox)` confirms the column is absent.
- The old claim logic did not reclaim stale `processing` rows after a Worker interruption.

**Source fix committed:** `0bbb2b10fa18ceb1a0b038d65bda75dfe260a044` fixes the binding count, records the claim timestamp, and reclaims stale processing leases. New migration `0033_notification_outbox_lease.sql` adds the missing nullable lease column and a composite due/lease index without rewriting existing notification rows. Regression coverage was added in `scripts/worker-auth.test.mjs`; schema validation now asserts the new column and index.

**Important:** migration 0033 is not yet applied to production. It must be applied after 0029, 0030 and 0031 and verified before deploying the Worker fix. No production data or schema was changed during this audit.


## POS expense and prepared-SQL binding audit — 18 November 2026

A second static audit of literal Worker SQL statements found an extra placeholder in the POS business-expense ledger insert. It supplied seven values for eight placeholders, causing expense posting to fail at the D1 binding layer. The SQL statement is corrected in commit `4fdc7c8bb0ee65887ed8434ecf71c50a6d4b7d56`.

A new `scripts/verify_sql_bindings.mjs` audit checks placeholder counts against JavaScript bind argument counts for literal `prepare("...").bind(...)` statements. It is now part of `npm run test:worker`. The first full static scan after the fix found zero remaining mismatches in the Worker file. CI must pass on the exact final SHA before release.


### Additional schema gap found — migration 0028 — 18 November 2026

A second read-only D1 check confirmed `enquiries.contact_type` is absent in production. The current public enquiry handler inserts this column and returns HTTP 503 when the insert fails. Therefore the public contact/complaint form is currently unable to save submissions against the inspected production schema. Migration `0028_enquiry_contact_types.sql` is required before 0029–0031 and 0033. The `product_media_assets.color`, rental pricing, product SEO, customer, AI key, product review and rental preview-token columns/tables checked in the same audit are present, so the confirmed pending range is 0028–0031 plus 0033; migration 0032's CNIC triggers are already present.

**Updated release sequence:** backup → 0028 → 0029 → 0030 → 0031 → 0033 → verify 0032 CNIC triggers remain → deploy matching source → production smoke tests. Re-check the schema immediately before each migration because production has no migration ledger.


### POS sale impact of migration 0030 — 18 November 2026

The current POS sale handler always inserts `customer_email`, `email_receipt_requested`, and `whatsapp_receipt_consent` into `pos_sales`, even when no receipt is requested, and conditionally inserts rows into `pos_receipt_outbox`. The inspected production schema has none of these columns/table. Therefore deploying the current POS Worker before migration 0030 would cause POS sale creation to fail at the D1 batch. Migration 0030 is a critical compatibility gate, not an optional email/WhatsApp enhancement.
