# De VERVE — Current owner handover and production acceptance register

**Last updated:** 24 November 2026 (after offline-POS migration and backup recovery validation)  
**Production:** https://deverve-official.pages.dev/  
**Repository:** https://github.com/Nabeelwasti/Deverve-Official  
**Production branch:** `main`  
**Cloudflare Pages project:** `deverve-official`  
**Production D1:** `deverve-production` (APAC)

This is the current owner-action register. It supersedes the historical 19 November checklist below. Keep credentials, CNIC evidence, customer information, payment details and recovery keys out of Git, issues and chat.

## 1. Verified engineering and production state

- PR #34 deployed least-privilege POS cashier access: separate invitation/grant tables, server-side POS-only authorization, cash-only cashier sales, own-shift and own-sale scoping, session revocation on permission changes and atomic shift close. Production migration 0040 is applied. **No cashier grants exist yet.**
- PR #35 deployed the owner-only System Health dashboard. It reports read-only database, queue, payment, inventory, POS, staff and provider-configuration metrics. It never returns secret values and does not infer provider delivery or backup/restore success from configuration.
- PR #36 published the CMS homepage through migration 0041. It has seven sections, five navigation links and four FAQs. PR #38 fixed category-image persistence, save validation, public media delivery and archive protection; migrations 0042–0043 are applied and three category artwork references are ready. PR #39 restored the shared storefront hamburger drawer, product/category/vehicle/page search, shared golden quote feed/fallback and complete branded footer with bottom credit strip. Owner copy/merchandising review remains.
- PR #33 hardened the encrypted D1 restore drill: inability to delete its temporary restore database now fails the workflow.
- Latest production Pages deployment: `bb73db9b-cc93-49fb-8fac-a7903c1990e5`, all five stages successful, URL https://bb73db9b.deverve-official.pages.dev, created `2026-11-24T04:16:05Z` by an ad-hoc deployment from `main` commit `95698525253cd78597da6a3fe48432b362496fe4`. No deployment was created during the current offline-POS work. Production and preview auto-deployments remain disabled; releases use controlled deployments.
- Last full CI run [45423402930](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45423402930), on code head `86d05ea`, passed all 20 workflow steps: type-check/build, production dependency audit, Worker/auth tests (147 passing), schema checks, 16 remote D1 inventory checks, isolated migration chain `0001`–`0049`, restored-production-clone rehearsal applying `0045`–`0049` with unchanged existing row counts and no new foreign-key violations, and 160 desktop/mobile browser tests. Temporary D1 test databases and the production clone were deleted. Subsequent commits corrected the offline migration test's minimum migration count/message and refreshed acceptance documentation; the connected GitHub action did not start a new run for those commits, so those final edits still need a CI run.
- Production mobile browser render returned HTTP 200 and confirmed the homepage search, golden quote strip, hamburger navigation, CMS content, branded footer and bottom credit strip. The same-origin `/api/quotes/random` endpoint returned HTTP 200. The previously verified unauthenticated `/api/admin/system-health` correctly returns 401.
- Production migrations 0039 (POS/SKU indexes), 0040 (cashier grants), 0041 (CMS homepage), 0042 (category artwork mapping) and 0043 (renderer-compatible category image JSON) are applied and read-back verified. Live D1 read-back confirms the published page contains all three category artwork references.
- An isolated APAC D1 concurrency test ran a website reservation and two-line POS sale concurrently against five units. Exactly one transaction won; the winning POS batch committed stock movements, payment, financial ledger, audit and receipt outbox consistently. The temporary database was deleted and its absence verified.
- PR #51 contains the offline-first POS implementation. Migrations `0045`–`0049` passed both a clean D1 migration-chain test and a rehearsal on an isolated restore of production data. **No offline-POS migration has been applied to production; no deployment or merge has occurred.** Purchase-cost snapshots remain server-only.
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
- [x] Offline-POS migration chain and production-clone rehearsal passed in CI run `45423402930`; existing production-clone row counts remained unchanged, no new foreign-key violations appeared, all required tables/triggers were present, and the temporary clone was deleted.
- [ ] Generate and securely custody the separate P-256 permit-signing keypair. Set Worker secret `POS_OFFLINE_PERMIT_PRIVATE_JWK` and public variable `POS_OFFLINE_PERMIT_PUBLIC_JWK`; never paste the private key into chat or Git. Keep `OFFLINE_POS_CHECKOUT_ENABLED` false until owner approval and all physical tests pass.
- [ ] **Offline-first POS is not enabled or accepted.** Test airplane-mode cash sale, app reload/termination, reconnect/sync, exact duplicate replay, same-key/different-payload conflict, permit expiry/revocation, storage denial and real scanner/printer behavior on the actual Android device. Use online POS only until this is complete.

## 5. Encrypted backups and recovery

The AES-256-GCM backup/restore workflow is scheduled daily at 02:00 Pakistan Standard Time (21:00 UTC). The first complete encrypted export, R2 read-back, isolated restore, row/schema comparison and temporary-database cleanup passed. Independent recovery and least-privilege hardening remain open:

- [x] Owner confirmed on 24 November 2026 that GitHub Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `D1_BACKUP_ENCRYPTION_KEY` are configured.
- [x] Successful encrypted backup/restore drill: run `45330719916` attempt 7 on 24 November 2026. R2 read-back and SHA-256 checks passed; isolated restore matched 66 tables, 102 indexes, 10 triggers and all row counts; temporary D1 database deletion was confirmed.
- [ ] Review and reduce the current Cloudflare token scope before production acceptance: replace account-wide D1 Edit and Workers R2 Storage Edit with D1 Write plus Workers R2 Storage Bucket Item Write scoped only to `deverve-db-backups` (object read/write/list).
- [ ] Confirm the encryption key is also stored in an owner-controlled password manager independently of GitHub and the R2 bucket; GitHub secret configuration alone is not a recoverable key-custody plan.
- [x] Confirm private bucket `deverve-db-backups` and workflow permissions; successful run `45330719916` attempt 7 verified access.
- [x] Complete the isolated non-production D1 restore, schema/row comparison and confirmed temporary database cleanup. Run `45330719916` attempt 7 passed all checks.
- [ ] Verify retention and a documented recovery-point/recovery-time objective.
- [ ] Back up private R2 media separately. A D1 SQL export does not include media bytes.
- [ ] Store an independent encrypted recovery copy outside the Cloudflare account and document named custodians.
- [ ] Do not claim full disaster-recovery readiness until independent off-account recovery copy, owner-controlled key custody and documented retention/RPO/RTO are verified.

Never paste tokens or recovery keys into this file or chat.

## 6. CNIC retention and legal review

- [ ] Review `docs/CNIC-RETENTION-APPROVAL-RECORD.md` and obtain written owner confirmation of purpose, collection scope, authorized roles, customer notice, retention period, deletion requests and legal-hold exceptions.
- [ ] Obtain written review from Pakistan-qualified counsel.
- [ ] Current production CNIC retention is not yet legally accepted; the existing retention behavior must not be shortened or bypassed until the replacement policy, deletion workflow and audit trail have been reviewed and tested.
- [ ] Keep CNIC originals private. Never put CNIC images/numbers in GitHub, public storage, AI prompts, email or public links.

## 7. Remaining engineering acceptance

- [x] CI run `45423402930` executed the remote D1 inventory integration suite (16 checks) and deleted its temporary database. The offline-POS D1 migration-chain and production-clone migration rehearsal also passed. [ ] Full offline Worker/API event-lifecycle, signature/replay/failure-injection and multi-event concurrency integration tests remain outstanding.
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
