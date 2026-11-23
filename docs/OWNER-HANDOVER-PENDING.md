# De VERVE — Current owner handover and production acceptance register

**Last updated:** 23 November 2026  
**Production:** https://deverve-official.pages.dev/  
**Repository:** https://github.com/Nabeelwasti/Deverve-Official  
**Production branch:** `main`  
**Cloudflare Pages project:** `deverve-official`  
**Production D1:** `deverve-production` (APAC)

This is the current owner-action register. It supersedes the historical 19 November checklist below. Keep credentials, CNIC evidence, customer information, payment details and recovery keys out of Git, issues and chat.

## 1. Verified engineering and production state

- PR #34 deployed least-privilege POS cashier access: separate invitation/grant tables, server-side POS-only authorization, cash-only cashier sales, own-shift and own-sale scoping, session revocation on permission changes and atomic shift close. Production migration 0040 is applied. **No cashier grants exist yet.**
- PR #35 deployed the owner-only System Health dashboard. It reports read-only database, queue, payment, inventory, POS, staff and provider-configuration metrics. It never returns secret values and does not infer provider delivery or backup/restore success from configuration.
- PR #36 published the CMS homepage through migration 0041. It has seven sections, five navigation links, four FAQs and two ready R2 media assets. A live mobile-sized browser render confirmed the hero, wholesale/rental CTAs, navigation and FAQs. Owner copy/merchandising review remains.
- PR #33 hardened the encrypted D1 restore drill: inability to delete its temporary restore database now fails the workflow.
- Latest production Pages deployment: `f41edaad-e700-4a5f-90d3-6ec9d827dbae`, all five stages successful, URL https://f41edaad.deverve-official.pages.dev. Production and preview auto-deployments are disabled again; releases use controlled deployments.
- Latest full CI: PR #36 run [45138379523](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45138379523), all 17 steps passed, including build/type checks, dependency audit, Worker tests, schema checks and storefront browser tests. The remote D1 integration suite remains skipped when dedicated credentials are absent.
- Production `/api/health` returned `status=ok` and `database=connected`. Unauthenticated `/api/admin/system-health` correctly returns 401.
- Production migrations 0039 (POS/SKU indexes), 0040 (cashier grants) and 0041 (CMS homepage) are applied and read-back verified.
- An isolated APAC D1 concurrency test ran a website reservation and two-line POS sale concurrently against five units. Exactly one transaction won; the winning POS batch committed stock movements, payment, financial ledger, audit and receipt outbox consistently. The temporary database was deleted and its absence verified.
- The live Turnstile verifier health endpoint returned `status=ok`, `secret_configured=true` and the expected hostname `deverve-official.pages.dev`. The invalid-token negative test and end-to-end public form acceptance remain pending.
- Production currently uses COD as the only active checkout method. No Safepay live/sandbox merchant acceptance is recorded.

## 2. Owner business data and decisions

- [ ] Confirm the public business phone/WhatsApp number, support email, business hours and exact address/service area for publication.
- [ ] Review the published CMS homepage in Admin → Content Studio: title, hero image, category labels, product collection, wholesale wording, rental feature, FAQs and navigation.
- [ ] Reconcile the catalogue physically by exact size/colour variant: SKU/barcode, images, stock, retail price, wholesale price, cost and authenticity claims only where evidenced.
- [ ] Confirm delivery coverage, delivery charges, dispatch/courier process, COD rules, cancellation and exchange policies.
- [ ] Verify the vehicle fleet, rental prices, dates/availability, deposits, mileage/fuel, insurance, driver requirements and rental terms.
- [ ] Confirm named authorized staff. Use individual accounts; never share the owner login.
- [ ] Review privacy notice, terms, exchange/refund policy, rental agreement, CNIC notice and complaint handling with qualified Pakistan counsel.

## 3. Provider accounts and custom domain

- [ ] Choose and verify ownership of the final custom domain. Only `deverve-official.pages.dev` is currently configured.
- [ ] Safepay: verify merchant account and complete sandbox onboarding. Add server-side credentials only through the approved secret manager; test success, decline, retry, duplicate webhook, wrong amount/currency and signature rejection. COD remains active until separate owner approval and sandbox/live acceptance.
- [ ] Email (Resend): verify sender domain and SPF/DKIM/DMARC, approve From/Reply-To addresses, configure secret, then test enquiry/order/owner notifications, bounce and retry behavior.
- [ ] WhatsApp Cloud API: verify Meta business, WABA and phone number; approve templates; configure secrets; test opted-in receipts and delivery failures. No marketing without consent.
- [ ] Turnstile: verifier secret and hostname are confirmed. Complete invalid-token Siteverify negative testing and test all public forms on the final hostname.
- [ ] Google Business Profile: complete verification and confirm public details, hours and website.
- [ ] Select an independent backup destination and named custodians; keep it outside the Cloudflare account.

## 4. POS cashier and physical-device acceptance

- [ ] Owner invites the intended cashier from Admin → Staff. Verify that the staff list shows the cashier role and that the user can only access POS.
- [ ] Supervise one real shift on the actual Android device: open register, cash-only sale, barcode/QR scan, receipt, sale history, shift close, counted cash and variance.
- [ ] Verify the cashier cannot access catalogue, inventory, staff, settings, expenses, cashbook, reports, refunds/voids or bulk customer-data exports.
- [ ] Revoke cashier access and verify the active session is invalidated.
- [ ] Test camera permission grant/deny, rear camera, autofocus, low light, glare, QR, Code 128 and retail barcodes. Test USB/Bluetooth scanner and manual SKU entry.
- [ ] Test actual thermal printer model, paper width, receipt alignment, Bluetooth/USB pairing and repeated prints. Test cash drawer if used.
- [ ] Test Android touch targets, page reload, slow network and recovery on the actual phone.
- [ ] **Offline-first POS is not enabled or accepted.** Do not take cash sales while disconnected; use the online POS until a persistent queue, idempotent server reconciliation, conflict handling and physical-device tests have passed.

## 5. Encrypted backups and recovery

The AES-256-GCM backup/restore script and scheduled workflow are in the repository. The schedule is daily at 02:00 Pakistan Standard Time (21:00 UTC). The workflow is **not operationally accepted** until the following are completed:

- [ ] Configure GitHub Actions secret `CLOUDFLARE_API_TOKEN` with the narrowly scoped D1 export, R2 backup and isolated restore permissions required by the workflow.
- [ ] Configure `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Generate `D1_BACKUP_ENCRYPTION_KEY` offline with `openssl rand -hex 32`; store it in an owner-controlled password manager independently of the R2 bucket and GitHub.
- [ ] Confirm private bucket `deverve-db-backups` and workflow permissions.
- [ ] Run a complete encrypted production export, SHA-256 integrity check, decrypt, isolated non-production D1 restore, schema/row comparison and confirmed temporary database cleanup.
- [ ] Verify retention and a documented recovery-point/recovery-time objective.
- [ ] Back up private R2 media separately. A D1 SQL export does not include media bytes.
- [ ] Store an independent encrypted recovery copy outside the Cloudflare account and document named custodians.
- [ ] Do not claim backup safety until the complete restore drill and independent copy are verified.

Never paste tokens or recovery keys into this file or chat.

## 6. CNIC retention and legal review

- [ ] Review `docs/CNIC-RETENTION-APPROVAL-RECORD.md` and obtain written owner confirmation of purpose, collection scope, authorized roles, customer notice, retention period, deletion requests and legal-hold exceptions.
- [ ] Obtain written review from Pakistan-qualified counsel.
- [ ] Current production CNIC retention is not yet legally accepted; the existing retention behavior must not be shortened or bypassed until the replacement policy, deletion workflow and audit trail have been reviewed and tested.
- [ ] Keep CNIC originals private. Never put CNIC images/numbers in GitHub, public storage, AI prompts, email or public links.

## 7. Remaining engineering acceptance

- [ ] Run the committed remote D1 integration suite from an authorized environment with dedicated test credentials; include Worker/API-level concurrency, rollback, reservation lifecycle, duplicate webhook and payment/ledger atomicity.
- [ ] Run sustained production-like inventory load tests and reconcile results against real stock processes.
- [ ] Complete live payment/courier/email/WhatsApp provider contract tests after credentials and accounts are configured.
- [ ] Complete the full production-smoke workflow, security-header checks and protected-route checks on the final controlled deployment.
- [ ] Review owner System Health dashboard after login. Investigate queued/failed notifications and POS receipts; configuration presence is not delivery proof.
- [ ] Review the published CMS homepage and product catalogue; ensure public copy matches verified stock, prices and service terms.
- [ ] Complete physical Android, scanner, printer and cash-drawer acceptance.
- [ ] Add the custom domain only after domain ownership and DNS verification.

## Release safety rules

- Keep Pages production and preview auto-deployments disabled between controlled releases.
- Before any production migration, inspect the live schema and back up first; do not replay a migration blindly.
- Require exact-release CI, reviewed diffs and post-deployment smoke checks.
- Never mark a capability production-accepted based only on UI presence, build success, configuration flags or a mocked test.
