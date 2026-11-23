# Production readiness — verified 23 November 2026 release

## Latest release evidence

- PR #34 (least-privilege POS cashier access) merged as `700a6521970ee783d7065259a908ae5a1cce475d`.
- PR #35 (owner-only System Health dashboard) merged as `a7ddf24ee9f117d447e2aacaa13e0ffeef622eee`.
- PR #36 (published CMS homepage and navigation) merged as `a9acb7f4a5f7c0bcd8a901e5064823262264a0e0`. CI [45138379523](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45138379523) passed all 17 steps. Migration 0041 was applied to production; the page has seven published sections, five navigation items, four FAQ entries, a single seed audit event and two ready media assets. A live mobile-sized browser render confirmed the hero, FAQ and navigation content. CI [45137153559](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45137153559) passed all 17 steps, including the full storefront browser suite. Cloudflare Pages deployment `f41edaad-e700-4a5f-90d3-6ec9d827dbae` from `main` commit `821707ee890eaa56c3eac0aaa059c837410aee51` completed all five stages. The deployed health route returns 401 without an authenticated owner session. The endpoint is read-only, reports operational counts and configuration booleans, and does not expose provider secrets or claim external backup/Turnstile health.
- CI run [45136071155](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45136071155) passed all 17 steps, including type-check/build, dependency audit, Worker auth tests, schema validation and the full storefront browser suite. The remote production-like D1 integration test step reports success but was skipped because dedicated remote test credentials are not configured.
- Production D1 migration `0040_pos_cashier_permissions.sql` was applied and read-back verified. It creates separate cashier invitation/grant tables and an active-grant index without changing legacy admin role constraints. Foreign keys were verified. The production database currently has zero cashier grants; no admin accounts or POS records were changed.
- Cashier permissions and owner System Health are deployed in Cloudflare Pages production deployment `f41edaad-e700-4a5f-90d3-6ec9d827dbae` from `main` commit `821707ee890eaa56c3eac0aaa059c837410aee51`; all five deployment stages passed. Cashier access is limited to cash-only sales, own shift lifecycle and own sales history; refunds, cash movements, expenses, finance reports, customer-data exports, catalogue, inventory and other admin APIs are denied. Permission changes revoke active sessions.
- The production `/api/health` check returned `status=ok` and `database=connected`. Browser-rendering rate limits prevented completing all additional protected-route smoke requests in this pass; no authenticated cashier was created or tested in the live account.
- The POS remains online-only. Offline queued sales are not enabled; do not accept offline cash without a persistent, idempotent, server-reconciled workflow and physical-device acceptance.


- PRs #30 (category artwork), #31 (D1 lookup indexes, barcode query-plan fix and backup schedule), #32 (acceptance documentation) and #33 (backup restore-drill cleanup hardening) are merged. PR #33 merged as `d066894cced09fd6dc5446a3d998037635d7215a`; subsequent main commits only update release documentation.
- PR #33 CI [45130147023](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45130147023) passed all 17 validation steps, including type-check/build, dependency audit, Worker tests, D1 schema checks, backup-script syntax and the storefront browser suite. The isolated remote D1 integration suite was not executed because dedicated test credentials are not configured.
- Cloudflare Pages production deployment [41aca77d](https://41aca77d.deverve-official.pages.dev) completed successfully from controlled trigger commit `ec0a0119e1686a4b4ebdd89722d279066a4962cd`; all deployment stages passed.
- Cloudflare Pages automatic production and preview deployments were restored to disabled after the controlled release.
- Production D1 migration `0039_pos_lookup_and_status_indexes.sql` was applied. Live query plans confirm `idx_product_variants_sku_nocase` and `idx_pos_sales_status_created` are used. The barcode scan query now qualifies for the existing partial barcode index and the live plan uses multi-index OR.
- The encrypted backup workflow is scheduled daily at 02:00 Pakistan Standard Time. No successful scheduled backup/isolated restore has yet been verified; required GitHub Actions secrets and a complete run remain prerequisites.
- The remote D1 integration suite was skipped in CI because dedicated test credentials are not configured.
- On 23 November, a live Cloudflare Browser Rendering check confirmed the production homepage title/HTML and `/api/health` returned `{"status":"ok","database":"connected"}`. This is a targeted health check, not the full production-smoke workflow; additional browser-rendering requests were rate-limited.

## Remaining critical acceptance gates

The platform is deployed and the tested release is healthy at the Cloudflare deployment-stage level, but it is **not fully production-accepted**. Outstanding work includes offline-first POS and reconciliation, a dedicated least-privilege CASHIER role, owner-only system-health telemetry, full Worker/API remote integration and sustained production-like inventory load tests, a verified encrypted backup/restore and independent recovery copy, live payment/courier/provider acceptance, Turnstile/email/WhatsApp production acceptance, physical Android and thermal-printer tests, owner catalogue reconciliation, owner review of the published CMS homepage content, custom domain setup, and qualified legal review of CNIC consent/retention. COD remains the only active checkout method.

See [PRODUCTION-ACCEPTANCE-MATRIX.md](PRODUCTION-ACCEPTANCE-MATRIX.md) for evidence required before each capability can be marked accepted.

---

# Production readiness — current release and acceptance status

## Current verified status — 23 November 2026

- PR #30, category artwork replacement, merged successfully as commit `66fd5595c72ce916f177fc6d32e94bb5b2d1c932`.
- CI run [45070011368](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45070011368) completed successfully, including the storefront browser suite.
- The merge is not yet deployed. The last verified Cloudflare production deployment remains deployment `0ba1f0aa-3730-4261-86f0-7d06e3a6e72a` from main trigger commit `07a06c981edcfd3db0d25664045be395805fb624`.
- Automatic Pages production and preview deployments remain disabled.
- The encrypted D1 backup workflow is scheduled daily at 02:00 Pakistan Standard Time (21:00 UTC). The schedule alone does not prove execution: the required GitHub Actions secrets and a successful isolated restore drill remain prerequisites.
- Live D1 inspection confirms the production schema includes catalogue, orders, inventory reservations/movements, POS, payments, webhook events, notification outbox and audit records. Schema presence does not prove operational acceptance.
- The POS is online-only; the existing service worker caches the app shell but does not implement IndexedDB offline sale synchronization.
- The POS API currently permits owner, manager and orders roles; a dedicated restricted CASHIER role has not been implemented.
- A dedicated owner-only system-health dashboard is not yet certified.
- COD is the active checkout method. Live gateway and courier acceptance remain outstanding.
- Production acceptance remains blocked by the evidence gates in [the production acceptance matrix](PRODUCTION-ACCEPTANCE-MATRIX.md).

Do not describe the platform as 100% production-ready until all critical code, security, backup, integration, provider, physical-device and owner-acceptance gates have evidence.

---

# Production readiness — historical engineering record and current status

## Current verified status — 22 November 2026, after PRs #26 and #27

### Source, CI and production deployment
- **Latest deployed application-code commit:** `70cb86805a4619461e236563db1f70a80d618369` (subsequent documentation-only commits do not change the deployed application bundle).
- **Latest application-code release:** `70cb86805a4619461e236563db1f70a80d618369`, merged through [PR #27](https://github.com/Nabeelwasti/Deverve-Official/pull/27), following [PR #26](https://github.com/Nabeelwasti/Deverve-Official/pull/26). The release includes the static HTML-shell loader fix, server-side multilingual Gemini TTS with Roman Urdu transliteration, online quote rotation with local fallback and no provider branding, and safe vehicle-gallery crop/reposition.
- **Latest verified mainline CI:** [run 45049994321](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45049994321) succeeded. TypeScript/build, dependency audit, Worker tests, D1 schema/constraint checks, backup-script syntax and **154 desktop/mobile Playwright tests** passed. The isolated remote D1 integration suite was skipped because dedicated Cloudflare GitHub Actions secrets are not configured.
- **Latest verified production deployment:** Cloudflare Pages project `deverve-official`, deployment `b52c76dc-5db6-4def-b9cb-edca1dceb3f0`, source commit `70cb86805a4619461e236563db1f70a80d618369`. Cloudflare confirmed successful queued, initialize, clone, build and deploy stages. Canonical URL: https://deverve-official.pages.dev.
- **Deployment controls:** Git-connected automatic and production deployments remain disabled; preview deployment setting remains `none`. Use a reviewed, CI-passing commit and explicit manual production deployment.

### Changes included in PRs #23, #26 and #27
- The initial HTML shell now renders the circular De VERVE vector mark outside the React mount root. It appears before app JavaScript loads and is removed only after React commits its first screen; it does not wait for a remote logo request.
- Golden quotes use a same-origin Worker endpoint and an edge-cached online quote pool. The visible strip displays quote text and author only; no upstream provider brand or link is shown. Original De VERVE quotes are the fallback when the online feed fails or returns invalid data.
- AI chat uses server-side Gemini TTS (Gemini 3.1 Flash TTS Preview with a 2.5 Flash TTS fallback) through the existing encrypted key vault. It auto-detects the model's supported languages, including Urdu and English. Roman Urdu is detected and transliterated into Urdu script while preserving English phrases, then spoken with a Pakistani Urdu prompt. The API key stays server-side; the endpoint is rate-limited, input-bounded and does not persist speech text or audio.
- Product and vehicle gallery images can be reopened for crop/reposition. Each editor creates a new derivative and swaps only the selected gallery attachment, preserving the original library object and other placements. Existing brand, CMS-section and category placements still need the same reusable per-placement editor.
- The nopCommerce assessment was updated. No nopCommerce source, themes, schema or dependencies were imported. Multi-store, tax automation and multi-currency remain deferred until the owner approves the business rules and operational need.

### Remaining release gates — not certified complete
1. **Encrypted D1 backup/restore:** workflow and AES-256-GCM script exist, but GitHub Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `D1_BACKUP_ENCRYPTION_KEY` are not configured. No successful automated encrypted backup/isolated restore drill is verified yet.
2. **Legacy backup object:** the private `deverve-db-backups` R2 bucket contains legacy object `d1/deverve-production-2026-11-21.sql` (139,921 bytes). The bucket has no public `r2.dev` endpoint or custom domain. Keep the object private and do not copy it to Drive or another cloud. Retain it until an encrypted backup and isolated restore drill succeed and the owner verifies the recovery key; then remove it under the documented retention procedure.
3. **Remote D1 integration:** still skipped in CI until dedicated test credentials are configured. Schema inspection and local schema checks do not replace a remote integration/restore test.
4. **Physical-device acceptance:** real Android camera, gallery upload, live Gemini TTS for Urdu/Roman Urdu and mixed Urdu-English, microphone, scanner, mobile checkout and touch behavior still require an owner-operated physical-device pass. The 154-test suite mocks audio playback; it does not certify real voice pronunciation or device speakers.
5. **Media editing scope:** product and vehicle-gallery recropping/repositioning are implemented with safe derivative-and-reattach flows. Existing brand, CMS-section and category assets still need the same reusable per-placement editor and preview.
6. **Provider and operations hardening:** payment/courier credentials and owner-approved live transaction tests, provider-adapter contract/health reporting, API contract/version tests and production telemetry remain outstanding.
7. **Independent off-account recovery:** Dropbox/Google Drive replication and a second independently controlled encrypted backup copy are not automated or verified.

Do not label the whole platform 100% production-ready until these external and operational gates have evidence. The successful Pages deployment and 154-test CI run verify the application release; they do not certify disaster recovery, live payment/courier operations or physical-device acceptance.


## Historical verified status — 21 November 2026 (superseded by the current release above)

This section supersedes older source, deployment, migration and catalogue-state claims in the historical notes below.

### Source, CI and Cloudflare release

- **Latest application code commit:** `8798eb8e43a6b78dd5226334ea158ab3af507edc`. This includes the merged catalogue cleanup/bulk-import hardening from PR #6 and a root `.node-version` pin to Node.js 24. Later `main` commits in this release sequence reconcile documentation only.
- **Review/merge:** PR [#6](https://github.com/Nabeelwasti/Deverve-Official/pull/6) is merged. The reviewed code removes non-functional landing-page filler, improves CSV product import and photo assignment, adds all-or-none owner/manager bulk publication, makes the product catalogue paginated and corrects admin product-action labels.
- **Latest CI:** [run 44882915815](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44882915815) completed successfully on the Node.js 24 pin commit. TypeScript/build, production dependency audit, Pages security-header validation, Worker authentication/regression tests, D1 schema/constraint checks and **114 desktop/mobile browser tests** passed. The isolated remote D1 integration suite was skipped because dedicated Cloudflare test credentials are not configured.
- **Verified application-code Pages deployment:** project `deverve-official`; deployment `03fd4f75-a5fa-4e03-804f-fa4cac529621`; source commit `8798eb8e43a6b78dd5226334ea158ab3af507edc`. Cloudflare reported successful queued, initialize, clone, build and deploy stages. The Pages build used Node.js `24.22.1`; the prior `@zxing/library` Node 22 engine warning is resolved. Documentation-only commits followed this application release.
- **Production smoke check:** the canonical `https://deverve-official.pages.dev/` returned HTTP 200 through Cloudflare Browser Rendering. The page title was `De VERVE | Elevate Your Style — Jhelum, Pakistan`. CSP, HSTS and `X-Content-Type-Options: nosniff` were present. The rendered Home page no longer contains the removed trust-pillar cards or generic intro strip.
- **Deployment controls:** source-triggered and production deployments were returned to `false` after the release; preview deployment setting remains `none`. The deployment is live, but later pushes will not deploy automatically. A future production release needs an explicit controlled deployment.
- **Domain:** Cloudflare lists `deverve-official.pages.dev` as the only project domain. No custom domain is configured.

### Catalogue and product-data QA

- The importer supports up to **1,000 products, 25,000 size/colour rows and 50 MB per CSV**. It processes sequential D1 transactions of at most 20 products and 250 variants; completed batches are retained if a later batch fails and the UI can resume remaining batches. Product photos are matched by slug and optional exact colour suffix, uploaded through authenticated content-verified media batches, and attached explicitly. The importer supports up to 100 matched photos per product, selected in the same import session.
- This is a large, bounded batch importer, **not literally unlimited**. Larger catalogues must be split across multiple CSV files. The current workflow deliberately retains request, file-size, image-count and transaction limits to protect browser memory, Worker request limits and D1 transaction size.
- Bulk publication is an explicit owner/manager action. The server validates the complete selected set and publishes all eligible products or none. Each product needs a positive retail price, an active in-stock variant and a ready shared cover image. Catalogue staff can import drafts but cannot bulk-publish.
- **Production QA cleanup:** products `Testing` and `Choco` were changed from published to draft on 21 November. `Testing` had zero active variants; `Choco` had the placeholder description `Test` and no attached product image. Both changes have `product.unpublished` audit-log entries. No variants, stock balances, media objects or orders were deleted or changed. The public page was rechecked; neither placeholder appears.
- **Remaining product-data acceptance:** `T2` has no attached product photos and describes itself as PULL&BEAR export quality; the owner must verify brand authenticity before that claim is relied on. `Tolaza` is described as black while attached image alt text identifies red; its M variant has a blank colour. Do not guess or rewrite these attributes. The legacy `Trouser` row combines sizes `S, M, L, XL` and colours `Black, Red, Grey, White, Yellow` under shared stock of 2,000 with no SKU/barcode. Reconcile physical counts and identifiers with the owner before splitting or changing stock.
- The production snapshot after placeholder cleanup contains 5 product records (3 published, 2 drafts), 7 active variants, 1 vehicle, 1 rental request, 2 rental documents and 13 media assets. No stock reservations were present in the inspected snapshot. A status change to draft does not delete the underlying stock or media.

### Production services, security and business acceptance

- **Production D1:** database `deverve-production`, 62 tables. A read-only `sqlite_master` inspection confirms the migration 0034 unique active variant-options index, 0035 `order_inventory_reservations` and its indexes, and 0036 `ai_task_runs`, `ai_task_events` and supporting indexes. Do not rerun migrations 0034–0036. No migration-ledger table exists; verify schema signatures directly.
- **AI key vault:** deployed Pages settings list `ADMIN_BOOTSTRAP_TOKEN` and `NabeelG_Api_key1` secret bindings alongside D1 `DB` and private R2 `MEDIA`. Cloudflare masks secret values; blank values in project read-back do not prove secrets are absent. No dedicated `AI_KEYS_ENCRYPTION_KEY` binding is present. One enabled Gemini key row uses `encryption_mode=bootstrap-derived`; owner-authenticated AI-key status and a real Gemini response remain required. Do not rotate the bootstrap token without a tested migration.
- **Checkout/payments:** Cash on Delivery is the only active payment method. Safepay is not active; the Cloudflare queue list is empty and its consumer, DLQ, Pages producer binding and production secrets are not configured. Do not claim online card payment is enabled.
- **CNIC retention:** R2 bucket `deverve-media-private` has the indefinite lock rule for `rental-private/`; D1 immutability triggers are present; the `deverve-cnic-retention` Worker has D1/R2 bindings. The indefinite retention policy still requires owner/legal approval. Do not weaken or delete protected CNIC evidence as part of catalogue work.
- **Turnstile:** the verifier Worker has a configured `TURNSTILE_SECRET` binding, but a real production challenge/token acceptance test remains outstanding.
- **Email/WhatsApp:** Resend delivery and Meta WhatsApp template/opt-in are not accepted or end-to-end tested.
- **Backups:** a same-account R2 copy/restore drill has been completed. This is not an independent disaster-recovery backup. An independent off-account D1/R2 backup and isolated restore drill remain outstanding. Do not copy customer/CNIC data to an unverified personal cloud destination.
- **Physical and business acceptance:** Android camera permissions/focus/lighting, barcode/QR scanning and failure recovery require physical-device testing. POS/finance reconciliation, customer checkout, inventory reservations, rental acceptance and owner-approved delivery/exchange/vehicle terms remain outstanding.

### Release decision

**Deployed to Cloudflare, but not fully production-accepted.** The source, exact-head CI and Pages build/deploy stages passed, and the canonical public address returned HTTP 200 with expected security headers. This does not prove real provider credentials, live D1 transaction integration, physical-device camera/scanner operation, business stock accuracy, legal retention approval, finance reconciliation or disaster recovery. Keep payment/provider features disabled until their respective acceptance tests pass. Do not describe the entire business system as fully production-ready until the remaining owner/operational gates above are closed.

---

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


## Feature-branch verification update — 19 November 2026

- **Exact PR head:** `2b3d61a1cbeda6ff1b7f1bf050d110deeb195f2b`.
- **Latest complete CI:** GitHub Actions run [44492745810](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44492745810) completed with conclusion **success** on that exact PR head. The build job passed locked dependency installation, dependency audit artifact capture, TypeScript/build, production dependency audit, Pages security-header output validation, Worker authentication/regression tests, D1 schema/constraint validation, Chromium installation and storefront browser tests. This is source/CI evidence only; it is not a production deployment or live-provider acceptance.
- **PR state:** PR #3 remains open and draft, based on `main` at `0bfd7141de2ec69e56a7245748cd4ec0cefeab0c`. It has not been merged.
- **Reservation model boundary:** online checkout currently relies on the order/order-item records plus the variant-level aggregate `reserved_quantity` counter and inventory movement ledger. There is no verified first-class per-reservation record with its own ID, expiry, owner, payment linkage and lifecycle state. Do not describe individual reservation traceability or automated expiry/reconciliation as complete. Do not automatically release stock based only on elapsed time: a delayed or retried payment-success webhook could otherwise leave a paid order without stock.
- **POS concurrency boundary:** the guarded POS insert and its unit test reduce oversell risk, but the test validates SQL guard construction. A real D1 integration test must still prove that competing POS/online writes cannot oversell and that every dependent sale, payment, ledger and outbox row rolls back together.
- **Release blockers still open:** production migrations 0028–0031 and 0033 require fresh schema reconciliation and an approved, backed-up release sequence (0032 CNIC protection must remain intact); no migration was run by this branch work. Real Android camera tests, real Gemini language/provider tests, Safepay sandbox transaction verification, Resend/WhatsApp delivery tests, owner-approved catalogue/pricing/policies, custom domain/Google Business Profile verification, independent D1+R2 backup and restore drill, and production-origin transaction smoke tests remain outstanding.
- **Safety:** no deployment, merge, production migration, secret change, live-data mutation or R2 object change was performed for this update. Continue to require the owner's explicit **“deploy now”** authorization before any Cloudflare deployment.


## 19 November 2026 — Safepay reconciliation remediation

- Added mutually dependent SQL predicates to the success webhook: the attempt can only become `succeeded` when its matching order is eligible; the order can only become `paid` when that exact attempt is succeeded and amount/order match; the gateway ledger insert requires both the paid order transaction reference and succeeded attempt.
- Bound each provider event ID to its first payload SHA-256 digest. Reusing an event ID with a different payload is rejected rather than silently replacing the digest.
- Expanded Worker regression tests for duplicate delivery, exactly-once ledger behavior, conflicting payload replay, and an ineligible order not consuming the attempt.
- **Validation in progress:** the first CI attempts exposed a stale FakeD1 query fixture; this was corrected. Do not report the remediation as passed until the latest branch-head CI completes successfully.
- The FakeD1 test double is sequential and in-memory. It does not prove D1 transaction rollback/isolation or real concurrent delivery. A real isolated D1 integration suite remains mandatory.
- Safepay handler still performs reconciliation synchronously before returning success. A durable event-inbox + prompt acknowledgement + asynchronous worker/queue design remains required before live enablement.
- Provider contract must be confirmed against the merchant's actual Safepay product and sandbox. Current Safepay checkout docs use raw-body HMAC-SHA512 and `token/type/data.tracker`; the newer Raast delivery guide describes a distinct timestamped HMAC-SHA256 envelope. Do not mix contracts.
- Safepay remains disabled until all above release gates and owner/provider acceptance are complete.


## 19 November 2026 — order inventory aggregation and isolated D1 evidence

- Duplicate order-item rows are aggregated by variant before admin dispatch/cancellation and customer delivery-fee decline. SQL guards use grouped `SUM(quantity)` checks, so individually valid rows cannot bypass combined stock/reservation limits.
- Checkout cart duplicates are consolidated by variant/selected options, and reservations are aggregated by variant ID.
- Added regression tests for duplicate cart lines, duplicate order-item dispatch and insufficient combined reservation.
- Added a reproducible remote D1 integration script (`npm run test:d1:integration`) that creates and removes a temporary D1 database. It is not part of ordinary CI because it requires explicit Cloudflare account/token environment variables.
- A focused temporary Cloudflare D1 database was manually exercised: concurrent checkout contention, duplicate-line dispatch/cancellation, insufficient combined stock/reservation, Safepay attempt/order/ledger transition, and fulfilment of the paid order. No production database was queried or modified for these tests.
- The focused test schema is not a full production migration clone. The repeatable integration script still needs an authorized run and the full migration/rollback suite still needs expansion.
- Latest observed CI run `44516695093`: TypeScript/build, dependency audit, Worker regression tests, D1 schema validation and Chromium install passed; storefront browser tests were still running when recorded.
- No deployment, merge, production migration or production data mutation was performed.


## Catalogue import and publication hardening — PR #6

- The landing page no longer displays the four static trust-pillar cards or generic intro strip. Functional category links and the live product catalogue remain.
- Bulk CSV intake accepts up to 1,000 products and 25,000 size/colour rows per file, then commits sequential D1 transactions of at most 20 products and 250 variants each. Earlier completed batches remain committed if a later batch fails; the UI retains progress and supports resuming the remaining batches.
- CSV fields include product name, slug, description, category, audience, retail/wholesale prices, SEO title/description, size, colour, optional supplier SKU/barcode, opening stock, reorder threshold and purchase cost. Server-generated SKU/barcodes remain the fallback. Duplicate options and duplicate supplied identifiers are rejected before submission; existing SKU/barcode conflicts are checked against D1.
- Product photos may be selected in the same import flow. File names must begin with the product slug (for example, premium-hoodie-front.jpg). Colour-specific photos use product-slug--colour--view.jpg (for example, premium-hoodie--black--front.jpg); the colour must match an imported variant, and an unknown colour suffix is rejected. A shared cover photo remains required for one-click publication. Uploads use the existing authenticated four-file / 20 MB media pipeline, server-side content-signature and SHA-256 checks, retry-stable media IDs, and explicit product-media attachment. Unmatched or failed files are reported; they are never silently attached to another product.
- Products are drafts by default. An explicit owner/manager option invokes POST /api/admin/products/publish-bulk. The server checks the complete selected set in one guarded D1 update: every product must be a valid draft with a retail price, an active variant with available stock, and a ready primary cover image. If one item fails, none are published. A single audit event records a successful bulk publication.
- The bulk-publish endpoint is restricted to owner/manager roles; catalogue staff can import drafts but cannot publish a bulk batch.
- This work is on PR #6 and must not be treated as deployed until the PR CI run passes, it is merged, and the Cloudflare Pages deployment is independently verified. No production business records or stock were changed by this code work.

- The admin product catalogue now paginates in deterministic 100-product pages, including status-filtered pages, so imports larger than the first 100 products remain browsable. The UI labels its loaded count accurately and provides a Load next 100 products action.


## Final release reconciliation — 21 November 2026, 12:20 UTC

This addendum supersedes earlier deployment, migration 0037 and D1 restore status statements above.

- Latest main commit: `b575306e0ed251d81079a54f8fc61f9d0ecbbc8d`.
- Exact-main CI run [44902016578](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44902016578) completed successfully.
- Production D1 migration `0037_discount_coupons.sql` is applied. Both coupon tables, six coupon indexes and six coupon triggers are present; `PRAGMA foreign_key_check` returned zero violations.
- The private 21 November D1 SQL backup was restored into a separate disposable D1 database: 62 application tables, 217 inserted rows, 96 indexes/triggers and zero foreign-key violations. Migration 0037 also succeeded on that isolated restored copy. All temporary databases were deleted.
- Cloudflare Pages production deployment `7cc647dd-b275-4682-b46d-ae8455c1493d` successfully deployed exact main commit `b575306e0ed251d81079a54f8fc61f9d0ecbbc8d`. Project `deverve-official` is connected to GitHub `main`, production deployment is enabled, preview deployment is disabled. Only `deverve-official.pages.dev` is configured; no custom domain is present.
- No new customer-browser smoke test against this exact deployment was completed in this session. Cloudflare's deployment-stage success is not a substitute for HTTP/API/browser acceptance.
- Full operational acceptance remains blocked by independent off-account backup/restore, physical Android scanner acceptance, real Gemini key/decryption response, production Turnstile acceptance, Safepay sandbox and live-provider approval, Resend/WhatsApp delivery, physical stock/catalogue reconciliation, POS/finance reconciliation, rental workflow acceptance and formal owner signature and CNIC retention technical acceptance.

### CNIC retention approval status
A draft approval record is now tracked in `docs/CNIC-RETENTION-APPROVAL-RECORD.md`. It is not signed. The previous indefinite-retention instruction must not be represented as a legal requirement. Keep existing evidence protected while the owner and Pakistan-qualified counsel review purpose, necessity, notice/consent, retention period, exceptions/legal holds, cloud storage locations and customer rights. Do not make new indefinite-retention promises or change locks/triggers before that review.


## Owner-confirmed CNIC policy update — 21 November 2026

The owner has confirmed that rental applicants must submit both sides of the CNIC for identity matching, rental approval, fraud prevention/security for premium and high-value vehicles, and legitimate rental-history verification. Access is limited to the owner and specifically authorized relevant rental managers/staff. The owner-selected retention period is 90 days after all payments, damages, charges, challans (if any) and other relevant fees/obligations are fully cleared and reconciled. Customer deletion requests are reviewed by staff and decided by the owner or authorized manager, with reasons recorded.

The policy is documented in:
- `docs/CNIC-RETENTION-APPROVAL-RECORD.md`
- `docs/CUSTOMER-CARE-COUPONS-CNIC-POLICY.md`
- `docs/OWNER-HANDOVER-PENDING.md`

**Critical implementation gap discovered during source review:** production migration `0032_permanent_cnic_evidence.sql` still creates triggers that block deletion and material updates to `rental_documents`. The current `workers/deverve-cnic-retention.js` only expires upload tokens, reports `document_retention: "indefinite"`, and never deletes CNIC objects. The admin document DELETE route returns HTTP 409 and says deletion is disabled. There is no verified production workflow yet for recording full financial/incident clearance, calculating the 90-day clock, reviewing customer deletion requests, authorizing legal holds, or securely purging both D1 metadata and R2 objects/backups.

**Do not deploy a quick trigger removal or scheduled object deletion.** A safe implementation requires an additive migration, a controlled owner/manager workflow for clearance and deletion requests, an audited legal-hold mechanism, an idempotent R2-first/metadata-second deletion process with retry/reconciliation, backup expiry/purge handling, authorization tests and a full isolated restore/retention rehearsal. Existing customer evidence must remain protected until this change is reviewed and tested.

Owner policy confirmation is recorded in the project conversation and in the current CNIC approval record. A formal owner signature and named staff authorisations remain operational handover items. External legal review is optional/recommended, not represented as completed or as a prerequisite the owner has accepted. The legal research is preliminary only. PECA 2016 sections 16 and 41, as amended, are potentially relevant to identity-information authorisation and confidentiality. As of the DLA Piper Pakistan guide updated 17 March 2026, a comprehensive standalone personal-data statute had not been enacted and the 2023 Personal Data Protection Bill remained a draft; current Gazette, Parliament and Ministry status must be rechecked before relying on it. Do not describe this AI research as a legal opinion or legal sign-off.

No production retention setting, R2 object, migration or customer CNIC record was changed as part of this documentation update.


### Additional storage-lock verification

Cloudflare R2 API inspection on 21 November 2026 confirmed that bucket `deverve-media-private` has an enabled bucket-lock rule with prefix `rental-private/` and condition `Indefinite`. The `deverve-db-backups` bucket also has an enabled `rental-private/` indefinite lock rule. These provider-level locks are separate from the D1 trigger and Worker behavior. They currently prevent implementing the owner's 90-day deletion schedule by application code alone.

Do not remove or weaken either lock until a replacement is designed and tested. An age-based 90-day bucket lock would be incorrect because the owner's clock starts after full rental clearance, not when an image is uploaded. The eventual design must preserve evidence during unresolved obligations and holds, then authorize deletion against the recorded clearance timestamp, while ensuring backup copies expire/purge consistently. The current encrypted CNIC backup UI is a manual browser download workflow; it does not automatically synchronize with Drive/Dropbox and cannot itself enforce a customer-specific deletion deadline.


## Rental CNIC notice and consent capture — 21 November 2026

- Published the revised English/Urdu customer privacy and rental CNIC policy in the website's Policies screen. It describes the owner's two-sided CNIC requirement, identity/fraud/security purposes, owner/relevant rental-staff access, access logging, 90-day post-clearance retention rule, customer deletion-request review and documented exception handling. It does not claim lawyer review or absolute security.
- Rental submission now sends a fixed notice version, `rental-cnic-2026-11-21-v1`, in addition to the affirmative consent flag. The Worker rejects a missing or unrecognised version and writes the notice version and consent timestamp to the rental request and audit event.
- Migration `0038_rental_cnic_consent_record.sql` adds the consent-version and timestamp fields. It labels pre-existing rows `legacy-unknown`; no historical consent is invented or backfilled.
- Production D1 `deverve-production` was updated with the two additive columns and the consent lookup index. The update was verified against `PRAGMA table_info(rental_requests)`; no existing rental row was rewritten. A later read-only grouped verification attempt returned SQLITE_AUTH, so the record distribution was not independently re-counted in that check.
- The admin rental workspace now displays the consent version and timestamp and warns staff that automated 90-day deletion is not yet active. The backup UI warns that browser-downloaded encrypted copies are external copies the website cannot track or remotely destroy.
- Staff SOP: `docs/CNIC-STAFF-HANDLING-SOP.md`.

**Important remaining gap:** migration 0038 records consent only. It does not implement financial clearance, deletion-request review/approval, legal holds, the 90-day scheduler or deletion from R2 and backups. D1 migration 0032 and the two R2 indefinite-lock rules still protect existing evidence. The public notice states the owner's retention policy, but the technical deletion mechanism must be completed and tested before the business tells a customer that a specific CNIC record has actually been deleted. Do not bypass existing locks/triggers as a shortcut.

Latest main commit and CI/deployment status must be verified from GitHub Actions and Cloudflare Pages before this addendum is considered released.


### Status clarification — 21 November 2026, 13:24 UTC

The preceding CNIC status paragraph is updated to distinguish the owner-confirmed operating policy from formal sign-off and optional external legal review. No lawyer review is claimed. The technical 90-day deletion gap described above remains open and must not be treated as resolved by consent capture or policy publication.


## Storefront and visual designer update — 21 November 2026

The following UX work has been committed to main:

- Customer AI chat now uses a compact composer with in-field attachment, voice, language and send controls. The previous horizontal quick-link strip has been removed; spoken response remains available as a small secondary action.
- Category selection now focuses the customer on the selected collection and hides the repeated category-card grid while the filtered catalogue is displayed. The collection cards continue to link to the matching catalogue route.
- The four home service cards now navigate to Fashion, Customer Account, Wholesale and Mobility rather than behaving as decorative cards.
- The defensive review explanation was replaced with neutral copy: “Customer experiences, shared in their own words.” Review verification labels remain truthful.
- Added a branded loading screen, reduced-motion handling, an editorial quote slot backed by the public DummyJSON random-quote endpoint, and a brand-authored fallback if the service is unavailable.
- Refined the storefront palette and catalogue cards toward a premium navy, ivory and champagne-gold visual system.
- Admin → Content & visual designer can now create a page explicitly as a homepage redesign. A category-grid section supports per-category image selection or upload, saved in the page section content, and category image previews. The public CMS renderer displays those images.

**Important CMS activation note:** the production site_pages query returned no rows at the time of this update. Therefore the new CMS homepage and its editable category-image cards are capabilities in the admin designer, not an already-published homepage. An authorised owner must create a page with purpose “Homepage redesign”, add the desired sections (including a category grid), upload/select the images, preview it, and publish it. Until then, the existing static storefront homepage remains the live fallback.

The Cloudflare Pages builds for commits 9c49b5a, b8b7a18 and d1836a4 reached successful build stages; the deployment for d1836a4 completed successfully. Later commits 8a40720 and f1610e6 were still queued/building at the last status check. These Pages builds verify TypeScript/Vite compilation only; they do not substitute for the GitHub Actions Worker, schema, dependency and Playwright suites. Do not claim those suites are green without their run results.

**Still not certified:** CNIC 90-day deletion remains technically unimplemented; independent off-account backup and full restore; real device scanner acceptance; live Turnstile, Safepay, email and WhatsApp tests; physical inventory/POS reconciliation; final rental workflow; named staff authorisations; formal owner signoff; and final customer-origin production smoke checks. The existing D1 deletion triggers and indefinite R2 locks must not be bypassed as a shortcut.


### Live category artwork controls — 21 November 2026

In addition to CMS category-grid artwork, the owner-only Admin → Website & brand settings panel now manages the six static storefront category cards (Men, Women, Kids, Everyday essentials, Hoodies & jackets, Trousers & pants). Uploads are validated as ready image assets, saved to the public `category_assets` setting, exposed by the storefront settings endpoint, and recorded in the audit log. Resetting a card removes its setting and restores the original artwork. Media archival checks now protect category images that are still referenced.

The admin upload workflow and live card renderer are implemented in main. The latest frontend Pages build and the GitHub Actions Worker/schema/Playwright suite must still be checked before this change is considered fully release-verified. No actual category artwork has been uploaded by the owner yet; the cards use their existing default artwork until images are selected in Admin.


## Customer AI chat file attachments — 22 November 2026

The customer AI chat attachment implementation was merged into `main` in PR #12 (`3812cb4e26f5cdb03f8564e32e7036b9bee7da04`) and deployed to Cloudflare Pages. It changes the customer composer from photo-only selection to a general file picker and sends bounded attachments to the existing server-side Gemini integration. The additional owner visual-design studio and brand refinements are being validated separately in PR #13.

Current supported input paths:
- Images: JPEG, PNG and WebP.
- Documents: PDF and UTF-8 text files. Common text/code/data extensions (TXT, Markdown, CSV/TSV, JSON, XML, HTML, CSS, JavaScript/TypeScript, Python, SQL, YAML, logs and similar) are read as text before sending.
- Audio: supported Gemini audio MIME types (one audio file per message).
- Video: supported Gemini video MIME types (one video file per message).

Limits in this implementation: at most three files, 4 MB per binary/PDF file, 6 MB combined, and 180,000 characters per text file. Attachments are processed transiently in the request and are not written to the shop database or media bucket. The Worker validates MIME type, encoded payload, selected file signatures for PDF and common images, aggregate size, and treats filenames/file content as untrusted data. Customer chat continues to warn customers not to send CNIC, OTP, passwords or payment-card details.

**Not every conceivable file format is supported.** Modern Office/OpenDocument packages (DOCX, XLSX, PPTX, ODT, ODS, ODP) are parsed locally in the browser by reading only selected XML entries, with entry-count, per-entry and total expanded-size bounds. Extracted text is sent to Gemini as plain text. This is not full-fidelity document rendering: charts, formulas, images, comments, tracked changes, layout, macros, embedded objects and some spreadsheet relationships may be omitted. Legacy DOC/XLS/PPT, encrypted documents, archives, executables and proprietary formats remain unsupported; convert them to PDF or plain text. The app does not upload opaque ZIP bytes to Gemini.

This work is **not production-released** until the new CI run, browser upload tests, Worker validation tests and a real Gemini acceptance test with representative PDF, text, image, audio and video samples pass. Provider/API quotas, file size and model modality availability apply. No attachment content is retained by the application after the request, but the content is transmitted to the configured Gemini provider for inference.


Attachment acceptance checklist for the combined PR:
- Run the full repository CI against the main-targeting pull request, including frontend/Worker TypeScript checks, Worker tests, schema validation and existing Playwright suite.
- Add/execute browser-level upload coverage for PDF, plain text and Office/OpenDocument files, plus rejection of encrypted, malformed and oversized packages.
- In a non-production test environment, exercise the actual configured Gemini fallback chain with representative PDF, image, audio and video fixtures; verify model capability errors fail clearly and never report a false successful analysis.
- Verify on a physical Android browser that the camera, gallery, general file picker, attachment removal, progress, errors and message submission work at supported viewport sizes.
- Confirm attachment payloads are absent from D1/R2, logs, analytics and error telemetry; inspect only redacted request metadata.
- Keep production release blocked until the above evidence is attached to the PR and owner accepts the operational/privacy wording.


## Owner visual design studio and brand system — 22 November 2026

The reconciliation branch for PR #13 adds an owner-only visual design workspace under Admin → Website & brand settings. It provides validated colour presets and custom HEX colours, typography, spacing density, button shape, card shadows, homepage headline/subtitle, and image slots for the hero, service cards, wholesale, mobility, testimonials and footer. Uploaded artwork is restricted to ready image assets; settings are validated server-side, saved as the public `site_design` setting, and recorded in the audit log. Referenced design artwork is protected from media archival while in use.

The storefront reads the public design settings and applies the selected tokens and artwork without replacing catalogue/product/vehicle image management. The latest merged AI attachment route from PR #12 is retained; the older attachment implementation from the audit branch is not copied over it. Original De VERVE logo and DV monogram assets are used for browser/PWA branding, and the logo endpoint is shared by exports and inventory labels.

**Release gate:** PR #13 must pass the current-head GitHub Actions build, dependency audit, Worker/security tests, schema checks and desktop/mobile Playwright tests before merge. Owner review of the design studio and actual uploaded artwork are still required. This visual designer controls the documented global tokens and selected artwork slots; it is not an arbitrary drag-and-drop editor for every page element.
