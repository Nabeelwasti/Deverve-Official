# De VERVE — Owner handover and pending acceptance checklist

**Last updated:** 19 November 2026  
**Repository:** `Nabeelwasti/Deverve-Official`  
**Working branch:** `fix/variants-camera-multilingual`  
**Tracking PR:** https://github.com/Nabeelwasti/Deverve-Official/pull/3

This file is the owner-side pending register. It is intentionally safe to keep in Git: **never put passwords, API keys, private tokens, CNIC images/numbers, customer data, payment details or recovery passwords in this file, GitHub issues, commits or chat.** Add secrets only in the named provider's secret manager after verifying the account and hostname.

## 1. Owner inputs — business decisions and data

- [ ] Confirm legal business name, registered address (if applicable), public phone/WhatsApp number, customer support email and business hours.
- [ ] Approve the final brand name spelling and logo/brand assets for website, invoices, labels and social channels.
- [ ] Supply verified product catalogue: product title, description, category, genuine brand/authenticity claims only where evidenced, sizes, colours, SKU/barcode, images, cost, retail price, wholesale price, tax treatment and opening stock.
- [ ] Physically count stock by exact size/colour combination. Reconcile old shared-stock variants before deactivating them or generating new individual variants. Never copy one shared aggregate quantity into every new variant.
- [ ] Supply verified vehicle/fleet data: registration/identifiers, make/model/year, photos, availability, self-drive and with-driver rates, deposits, mileage/fuel terms, insurance/driver requirements and service/maintenance status.
- [ ] Approve delivery coverage, delivery charges, dispatch/courier process, cash-on-delivery rules, order cancellation rules and customer support process.
- [ ] Approve privacy notice, terms, return/exchange/refund policy, rental agreement, damage/deposit policy, CNIC consent/retention notice and complaint handling. Obtain local legal advice where required.
- [ ] Confirm staff roles and named authorized users. Use individual accounts; do not share the owner login.

## 2. Provider accounts and credentials — owner action

Only configure these after the final production hostname is confirmed. Never commit secrets.

- [ ] **Domain/DNS:** purchase or confirm ownership of the final domain; provide the exact hostname choice and complete DNS verification.
- [ ] **Safepay:** create/verify merchant account; complete merchant onboarding; request sandbox credentials first. Add the sandbox API key, secret and webhook/signature secret to the production platform secret manager only when instructed by the approved release plan. Verify callback/webhook URL and perform a real sandbox payment, retry and failure test. Live credentials and live transactions require a separate explicit business decision.
- [ ] **Email provider (Resend):** verify sender domain, publish SPF/DKIM/DMARC records, choose approved From/Reply-To addresses, add the API key as a secret and test enquiry, order and owner notifications, retries and bounce handling.
- [ ] **WhatsApp Cloud API:** confirm Meta Business Portfolio, WhatsApp Business Account and phone number; complete display-name/number verification; create and obtain approval for required templates; provide phone-number ID, WABA ID and access token through secret settings; test opted-in customer receipt and owner notification. Do not send marketing messages without the required consent.
- [ ] **Turnstile:** confirm production hostname and widget; add public site key to the appropriate public configuration and secret key only to server-side secrets; test success and rejection.
- [ ] **Google Business Profile:** finish verification and confirm public address/service area, phone, hours and website URL.
- [ ] **Google Drive/Dropbox backup destination:** owner selects the independent storage account and authorized custodians. Google Drive upload is currently manual; Dropbox vault folders exist but no automatic upload integration is verified.

## 3. Physical device and real-provider acceptance

- [ ] On the actual Android phone, test camera permission grant/deny, rear/front camera availability, autofocus, low light, glare, QR, Code 128 and common retail barcodes; test repeated open/close and camera release.
- [ ] Test USB/Bluetooth scanner and manual SKU/barcode entry as alternatives.
- [ ] Test AI support in Urdu script, Roman Urdu and English with realistic product, delivery, return and rental questions. Confirm no fabricated stock, prices, policies or vehicle availability.
- [ ] Confirm AI does not receive CNIC evidence, customer payment data, HR, finance or rental-contract personal data. Review retention and provider data-processing terms before enabling public AI.
- [ ] Run Safepay sandbox success, decline, retry, duplicate webhook, delayed success, wrong amount/currency and signature-rejection scenarios.
- [ ] Test email and WhatsApp delivery end-to-end, including opt-in, invalid recipient, provider outage, retry, duplicate event and staff-visible delivery status.
- [ ] Test customer signup/login, password/session recovery policy, order placement, stock reservation, cancellation, dispatch, return request, manual refund recording and receipt delivery.
- [ ] Test rental enquiry, CNIC consent/upload, authorized staff-only retrieval, confirmation gating, rental pricing, cancellation and document access audit.
- [ ] Test admin permissions using separate owner, manager, inventory, orders and rental staff accounts; verify staff cannot access unrelated sensitive records.

## 4. Backup, recovery and evidence protection

- [ ] Keep CNIC originals private and immutable. Never upload raw CNIC files to public folders, GitHub, AI tools, email or public links.
- [ ] Export D1 and verify archive integrity. Store an encrypted copy outside the Cloudflare account and keep recovery credentials separately.
- [ ] Back up private R2/media objects separately; a D1 export does not contain R2 image bytes.
- [ ] Keep at least one independent off-account copy with access restricted to named custodians.
- [ ] Perform a restore drill into an isolated non-production environment. Verify D1 records and private R2 objects together, then document results and recovery time.
- [ ] Decide and document backup frequency, retention, custodians, recovery-point objective and recovery-time objective.
- [ ] Do not alter, overwrite or delete permanent CNIC evidence. Existing database immutability triggers and R2 retention safeguards must be re-verified during release.

## 5. Release gates — do not bypass

- [ ] Reconcile live production schema immediately before release. Production has no migration-ledger table; inspect actual tables, columns, indexes and triggers.
- [ ] Verify and back up production before applying the pending additive migrations. The documented sequence is 0028 → 0029 → 0030 → 0031 → 0033; verify CNIC protections from 0032 remain intact. Migration 0034 is branch-only and also requires reviewed release sequencing.
- [ ] Complete a real D1 integration test for simultaneous online/POS stock contention and full rollback of all dependent sale/payment/ledger/outbox records.
- [ ] Resolve and test reservation lifecycle/payment reconciliation. Do not expire a reservation solely by elapsed time while a payment can still succeed or a webhook can be retried.
- [ ] Obtain a green CI run for the exact release commit and review the complete diff.
- [ ] Obtain owner approval for business data, legal policies, provider configuration and operational support.
- [ ] Owner explicitly authorizes deployment by saying **“deploy now”**.
- [ ] After deployment, run production-origin smoke tests and low-risk end-to-end transactions; monitor errors, webhook queues, email/WhatsApp queues and stock/finance reconciliation.

## 6. Engineering work tracked by the development team

- [x] Add mutually dependent SQL guards to the Safepay payment-attempt, order-paid and gateway-ledger writes; reject same event ID with a different payload digest. Add regression coverage for duplicate delivery, ledger exactly-once, conflicting payload replay and ineligible-order state preservation. See [the 19 November payment and inventory audit](PAYMENT-INVENTORY-AUDIT-2026-11-19.md).
- [x] New Safepay regression suite passed in CI run `44504567013` on commit `a8325a09b656f33397f15de7de59ac65082abd33`; all workflow steps passed, including Worker tests, D1 schema validation and storefront browser tests. [View run](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44504567013).
- [ ] Confirm final documentation-only branch head CI run `44504634498` completes successfully.
- [ ] Add isolated Cloudflare D1 integration tests for concurrent duplicate delivery, rollback, SQL constraints and payment/ledger atomicity. The in-memory FakeD1 is not a substitute.
- [ ] Redesign Safepay webhook ingestion for durable event storage, prompt acknowledgement and asynchronous processing using a durable queue/worker. Confirm the exact merchant product's event contract against sandbox fixtures before enabling live payments.

- [ ] Add first-class reservation records with immutable identifiers, order-item/variant linkage, quantity, state transitions, timestamps, payment tracker linkage, idempotency and audit history. Design safe expiry/reconciliation around provider webhook guarantees.
- [ ] Add real D1 integration tests for competing online and POS writes, transaction atomicity, retries and rollback.
- [ ] Complete stock movement/reconciliation paths for adjustments, sales, returns, exchanges, damaged goods, transfers and corrections, with permission checks and audit entries.
- [ ] Verify production schema/migration release ordering and compatibility in an isolated copy before any production mutation.
- [ ] Complete full D1 + R2 backup automation/restore strategy and test it independently.
- [ ] Review rate limits, abuse controls, security headers, session invalidation, role boundaries, webhook idempotency, logs/PII redaction and operational monitoring on the final release SHA.

## Current verified state (19 November 2026)

- [x] Feature branch and draft PR maintained separately from main. PR #3 remains open, draft, unmerged and mergeable; current head `685b858b2318e34e296beee02c9d50579ff61bc3`, base `main` at `0bfd7141de2ec69e56a7245748cd4ec0cefeab0c`.
- [x] Latest feature-branch CI run `44496743936` completed successfully on exact current PR head `685b858b2318e34e296beee02c9d50579ff61bc3` (19 November 2026). All 13 workflow steps passed: locked dependency install, dependency-audit artifact capture, TypeScript/build, production dependency audit, Pages security-header validation, Worker authentication/regression tests, D1 schema/constraint validation, Chromium setup and storefront browser tests. [View run](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44496743936).
- [x] POS conditional stock guard added; its unit test validates guard construction.
- [x] PR description and production-readiness notes identify integration and operational blockers.
- [x] Latest CI job and every step independently inspected; all completed successfully. This is automated source validation only, not production-origin or physical-device acceptance.
- [x] Focused checkout/payment source audit completed; the high-severity Safepay partial-commit risk has a guarded feature-branch remediation and regression tests. Real D1 integration, durable webhook processing and provider sandbox verification remain release blockers.
- [x] No production deployment, merge, production migration, secret change, live-data mutation or R2 object change was performed as part of this work.
- [ ] This successful CI run is not proof of production deployment, physical Android behavior, live payment/email/WhatsApp delivery or business acceptance.


## Variant inventory lifecycle — 19 November 2026

- [x] Aggregate duplicate order-item quantities by variant before admin dispatch/cancellation and customer delivery-quotation decline.
- [x] Add grouped SQL guards so combined quantities cannot exceed physical stock or reserved stock.
- [x] Add regression tests for duplicate checkout lines, duplicate order-item dispatch and insufficient combined reservations.
- [x] Run isolated remote Cloudflare D1 checks for concurrent checkout contention, duplicate-line dispatch/cancellation, insufficient stock/reservation, Safepay reconciliation and paid-order inventory fulfilment. The test database was temporary and separate from `deverve-production`.
- [x] Add a repeatable `npm run test:d1:integration` suite. It requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (D1 read/write only) and automatically creates/deletes a uniquely named test database.
- [ ] Run the committed integration script from the owner's authorized environment and retain its output as a release artifact.
- [ ] Expand the isolated integration suite against the complete current migration set and add SQL constraint-failure/rollback and concurrent duplicate webhook replay tests.
- [ ] Keep first-class reservation records, durable async Safepay webhook ingestion, provider sandbox acceptance, backups/restore and production schema release sequencing as separate release gates.
