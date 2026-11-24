# De VERVE Owner Setup & Handover Tracker

**Last reviewed:** 24 November 2026 (live Cloudflare/GitHub and offline-POS release-gate reconciliation)  
**Repository:** `Nabeelwasti/Deverve-Official`  
**Production site currently documented:** https://deverve-official.pages.dev/  
**Admin:** https://deverve-official.pages.dev/admin  
**Release rule:** Cloudflare Pages automatic production deployments and preview deployments are currently disabled. PR branches are not live previews; a merge or push must not be assumed deployed. Use controlled, owner-approved deployments only after exact-head CI, backup, migration, security, business and physical-device acceptance. Obtain owner approval before production data changes, database migrations, secret changes, or external provider/account changes.

This is the single owner-facing register for external accounts, approvals, business information, provider choices, credentials, and acceptance work. Keep it updated as tasks are completed. Do not put passwords, API keys, access tokens, private keys, CNICs, or payment credentials in this file, GitHub issues, source code, or ChatGPT messages.

## Status legend

- **[VERIFIED IN REPO]** — implementation or configuration is evidenced by the current source/docs/tests. This does not necessarily mean it is live in production.
- **[OWNER ACTION]** — the owner/business must create, approve, supply, configure, or test something.
- **[DEVELOPER ACTION]** — code, integration, test, or documentation work remains.
- **[BLOCKED]** — cannot safely finish until an owner decision, account, credential, domain, or approval exists.
- **[NOT STARTED]** — no implementation or verified setup recorded.
- **[DONE BY OWNER]** — use only after the owner confirms and evidence/check is recorded.

Do not mark a task complete just because a form, button, setting, or provider option exists. Verify a real end-to-end transaction or delivery.

---

## 1. Hosting, domain, DNS, and release controls

| Item | Current record | Next action |
|---|---|---|
| Cloudflare Pages project | **[VERIFIED IN REPO]** Project documented as `deverve-official` | Owner: confirm the Cloudflare account owner and billing/contact recovery |
| Production URL | **[VERIFIED IN REPO]** `https://deverve-official.pages.dev/` | Owner: confirm whether this remains the permanent public URL |
| Custom domain | **[BLOCKED]** No final custom domain recorded in this tracker | Owner: decide the official domain (if any), purchase/control it, and share the exact hostname |
| DNS / SSL | **[OWNER ACTION]** Verify DNS ownership and HTTPS after domain decision | Owner + developer: test apex, www, redirects, TLS and canonical host |
| GitHub branch | **[VERIFIED IN REPO]** `main` is the production source branch | Keep changes reviewed and tested |
| Git-to-Cloudflare release | **[VERIFIED LIVE · 24 Nov 2026]** Cloudflare Pages is connected to this GitHub repository, but `deployments_enabled=false`, `production_deployments_enabled=false`, and preview deployment setting is `none`. Latest production deployment remains the controlled deployment from main commit `95698525253cd78597da6a3fe48432b362496fe4`; PR #51 remains draft/unmerged/undeployed. | Keep deployment disabled until the documented backup, inventory, provider, physical-device and owner acceptance gates pass. The user has requested deployment after those gates; do not infer that a source push is live. |
| Production migration state | **[VERIFIED LIVE, READ-ONLY · 18 Nov 2026]** D1 contains `enquiries.contact_type`, `enquiry_email_queue`, `pos_receipt_outbox`, `notification_outbox`, the 0031/0033 lease indexes and the 0032 CNIC immutability triggers. The related 0028–0033 schema objects are present. No migration-ledger table exists. | Do not rerun these migrations. Reconcile schema objects directly before any future migration; preserve the CNIC triggers and indefinite R2 lock. |
| Release acceptance | **[DEVELOPER ACTION]** CI passing is not equivalent to live acceptance | Run the documented smoke tests only after the owner authorizes deployment |

**Important:** The migration gaps recorded in older sections below have been superseded by the 18 November 2026 live schema reconciliation above. Do not rerun migrations whose objects are already present. Never bypass CNIC immutability controls or the indefinite R2 lock.

## 2. Meta / Facebook / Instagram / WhatsApp

### Meta Business assets

- [OWNER ACTION] Confirm the official Meta Business Portfolio (Business Manager) that De VERVE controls.
- [OWNER ACTION] Confirm the official Facebook Page name and URL.
- [OWNER ACTION] Confirm the official Instagram professional account and URL; connect it to the correct Facebook Page.
- [OWNER ACTION] Confirm who has full control / admin access and enable two-factor authentication for all administrators.
- [OWNER ACTION] Provide the public Page URL, Instagram URL, Business Portfolio ID and Page ID when available. IDs are not passwords, but share them privately with the project owner/developer.
- [OWNER ACTION] Decide whether Meta Pixel and Conversions API are wanted. If yes, create the Pixel/Dataset and provide its ID; do not share access tokens in chat.
- [DEVELOPER ACTION] Verify links, social previews, Pixel consent/privacy behavior and event quality before enabling tracking.
- [BLOCKED] No verified Meta Business Portfolio, Page ID, Instagram account ID, Pixel ID, or business app credentials are recorded here. Do not assume previously created social profiles are connected or verified.

### WhatsApp Cloud API (website/POS notifications)

- [VERIFIED IN REPO] README documents a consent-gated WhatsApp POS receipt queue using Meta WhatsApp Cloud API and an owner-approved Utility template. Messages must not be sent without recorded customer opt-in.
- [OWNER ACTION] In Meta for Developers, create/select the De VERVE business app and add the WhatsApp product.
- [OWNER ACTION] Complete WhatsApp Business Account setup and business/phone verification as required by Meta.
- [OWNER ACTION] Choose the dedicated business phone number. Confirm it is not already registered to another WhatsApp account unless the supported migration process is intended.
- [OWNER ACTION] Record the WhatsApp Business Account ID (WABA ID), Phone Number ID, display name and verified phone number.
- [OWNER ACTION] Create a Utility message template for POS receipts and submit it for Meta approval. Suggested body: “Hello {{1}}, thank you for shopping with De VERVE. Your receipt {{2}} totals {{3}}. Please keep this message for your records.”
- [OWNER ACTION] Confirm template language code exactly as approved (for example, `en` or `en_US`).
- [OWNER ACTION] Generate a durable System User access token with only the permissions required by the app. Store it directly as a Cloudflare secret; never paste it into chat or GitHub.
- [DEVELOPER ACTION] Verify the actual template name, language, placeholders, webhook/status handling, retry behavior and consent audit in the current Worker before live use.
- [OWNER ACTION] Test a real, opted-in recipient with a low-risk receipt; confirm sent, delivered and failed states.
- [BLOCKED] Live WhatsApp delivery is not confirmed merely because the code/queue exists.

**Documented Pages variables/secrets (verify names against current code before setting):**
- Secret: `WHATSAPP_ACCESS_TOKEN`
- Plain variables: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_RECEIPT_TEMPLATE`, `WHATSAPP_RECEIPT_LANGUAGE`
- Optional: `WHATSAPP_API_VERSION` (README says default `v27.0`)

Do not use WhatsApp for unsolicited marketing. Marketing templates, opt-in, template approval and Meta policies are separate from transactional Utility receipts.

## 3. Email and domain authentication

- [VERIFIED IN REPO] Resend email queue and delivery worker are documented. Email delivery is inactive until a verified sender and credentials are configured.
- [OWNER ACTION] Decide the official sender address (example format: `orders@your-domain`, only if that domain is owned).
- [OWNER ACTION] Create/own the Resend account and add the sending domain.
- [OWNER ACTION] Publish the DNS records Resend provides (SPF, DKIM and any required return-path records). Do not guess DNS values.
- [OWNER ACTION] Wait for Resend to verify the domain and send a test email from its dashboard.
- [OWNER ACTION] Select the inbox that receives business alerts and order/rental notifications.
- [OWNER ACTION] Add the API key directly in Cloudflare Pages production secrets, not GitHub or chat.
- [DEVELOPER ACTION] Test enquiry emails, order notifications, rental notifications, POS receipt emails, retry handling, bounce/failure logging and sender alignment.
- [BLOCKED] Do not promise email verification or password-reset emails until the sender and relevant flows are actually implemented and tested.

**Documented Pages settings:**
- Secret: `RESEND_API_KEY`
- Plain variables: `RESEND_FROM_EMAIL`, `OWNER_NOTIFICATION_EMAIL`

Also decide whether customer support should use one inbox or separate addresses for orders, rentals and general enquiries.

## 4. Payments and merchant onboarding

**Current recorded state:** COD is the confirmed fallback. A Safepay adapter exists, but no live merchant credentials or end-to-end live transaction are recorded. JazzCash and Easypaisa are not confirmed integrated providers. Do not display or claim a provider is active until its adapter, credentials, webhook verification and reconciliation tests are complete.

### Owner decisions required

- [OWNER ACTION] Choose the preferred online payment provider: Safepay, JazzCash, Easypaisa, bank transfer, or a staged combination. Do not choose only because a provider advertises “free”; compare merchant eligibility, fees, settlement time, refunds, chargebacks, API access and Pakistan support.
- [OWNER ACTION] Confirm the legal business/merchant name, business type, registration documents, tax details (if applicable), settlement bank account and authorized signatory required by the chosen provider.
- [OWNER ACTION] Complete merchant onboarding directly with the provider.
- [OWNER ACTION] Obtain sandbox credentials first. Keep sandbox and live credentials separate.
- [DEVELOPER ACTION] Complete sandbox success, failure, cancellation, retry, duplicate webhook, amount/currency mismatch, timeout, reconciliation and refund tests.
- [OWNER ACTION] Perform and reconcile a real low-value live payment only after written approval and a safe release.
- [OWNER ACTION] Supply official bank-transfer details only if bank transfer is selected: account title, bank, account/IBAN and any payment reference instructions. Never invent or publish details before approval.
- [DEVELOPER ACTION] Ensure manual transfer remains unpaid until independently verified; record verifier, timestamp, reference and audit history.
- [OWNER ACTION] Decide refund policy, refund authority, refund methods and expected processing times.

### Safepay variables (existing adapter; verify exact current code requirements)

- Secret values must be entered directly in Cloudflare Pages secret settings, never in source/chat.
- `SAFEPAY_ENV=sandbox` for initial sandbox work.
- Production is separately gated by `SAFEPAY_ENV=production` and `SAFEPAY_LIVE_ENABLED=true`; do not enable until merchant approval and live testing.
- Confirm the exact Safepay secret names from current Worker code and setup documentation before configuration. Never copy credentials between environments.

### Pakistan payment options

- JazzCash / Easypaisa: **[BLOCKED]** until merchant onboarding and a reviewed provider adapter are complete.
- Bank transfer: **[OWNER ACTION]** only if owner supplies verified account details and approves the manual verification process.
- COD: **[VERIFIED IN REPO]** existing checkout method; still requires real-world order acceptance testing.

## 5. Google Drive and disaster-recovery backup

- [VERIFIED IN REPO] CNIC originals are retained in private R2 with permanent protection controls. Migration 0032 was applied and a metadata-update rejection was verified on 18 Nov 2026.
- [VERIFIED IN REPO] Browser-side per-rental encrypted `.dvbackup` creation and local decrypt/download recovery are implemented.
- [NOT STARTED] Website OAuth upload/sync to Google Drive is not implemented. Current per-rental backup is a manual download/upload workflow.
- [NOT STARTED] One-click business-wide D1 + R2 + media backup and tested restore pipeline are not complete.
- [OWNER ACTION] Confirm the business controls `deverve61@gmail.com`; enable 2-step verification and verify recovery email/phone.
- [OWNER ACTION] Create restricted Drive folders from `docs/SECURE-BACKUP-OPERATIONS.md`; do not use “Anyone with the link”.
- [OWNER ACTION] Confirm named backup custodians and access permissions.
- [OWNER ACTION] Create a Google Cloud project, enable Google Drive API, configure OAuth consent screen, and create a Web OAuth client when the final website hostname and OAuth design are confirmed.
- [OWNER ACTION] Share only the OAuth Client ID with the developer through an appropriate private configuration channel. Never share client secrets or refresh tokens in chat.
- [DEVELOPER ACTION] Implement and test least-privilege Drive upload (prefer `drive.file`), resumable upload, checksums, versioning, access controls, failure recovery and audit logs.
- [DEVELOPER ACTION] Implement complete backup and restore drills without changing/deleting original CNIC evidence.
- [OWNER ACTION] Upload encrypted backup copies and keep a second independently encrypted offline copy. Keep backup passwords separately in a password manager.
- [OWNER ACTION] Complete and record a restore drill in a separate recovery environment.

**Backup folders documented:** 00 Backup Register; 01 Identity Evidence (Encrypted Only); 02 Database Snapshots (Encrypted Only); 03 Finance & Accounting (Restricted); 04 Sales, POS & Invoices (Restricted); 05 Orders & Customer Records (Restricted); 06 Product & Vehicle Media; 07 HR & Staff Records (Restricted); 08 Legal, Contracts & Policies (Restricted); 09 Marketing & Brand Assets; 10 Website & Technical Recovery; 99 Restore Drills & Reports.

**Never delete, overwrite, expire or replace original CNIC evidence.** A backup is not a substitute for the original. A D1 export does not contain R2 image binaries.

## 6. Google and Microsoft customer sign-in

- [VERIFIED IN REPO] Secure integration requirements are documented in `docs/IDENTITY-PROVIDERS-AND-FREE-INTEGRATIONS.md`.
- [NOT STARTED] Google and Microsoft customer sign-in are not yet implemented or enabled.
- [OWNER ACTION] Confirm final production hostname first; callback/redirect URLs must match it exactly.
- [OWNER ACTION] Create a Google Cloud OAuth Web Client ID and configure authorized origins/redirect URI as supplied after implementation design is finalized.
- [OWNER ACTION] Create a Microsoft Entra app registration and provide the Application (client) ID; decide whether sign-in should support personal Microsoft accounts, work/school accounts, or both.
- [DEVELOPER ACTION] Implement OIDC Authorization Code + PKCE/state/nonce and backend token validation; link external identities to existing customer records safely.
- [DEVELOPER ACTION] Keep existing De VERVE sessions and D1 roles authoritative. OAuth sign-in must never grant admin/owner privileges automatically.
- [DEVELOPER ACTION] Add tests for invalid issuer/audience/signature/nonce/state, expired tokens, unverified email, duplicate identity, account linking and session revocation.
- [OWNER ACTION] Test new customer sign-in on Android and desktop before enabling publicly.

Google sign-in and Google Drive access are separate permissions and should use separate consent scopes. Microsoft sign-in does not grant Microsoft 365/OneDrive access automatically.

## 7. AI and optional free tools

- [VERIFIED IN REPO] AI provider key management and AI chat components exist in the project; actual provider configuration and current route behavior must be verified before advertising them as working.
- [OWNER ACTION] Decide whether AI chat is public customer support, staff-only assistant, content assistant, or a combination.
- [OWNER ACTION] Choose provider(s) and review data handling/retention terms. Potential candidates include Gemini API free tier for low-risk public content and other providers only after pricing/privacy review.
- [DEVELOPER ACTION] Verify provider calls happen server-side; API keys must never be exposed in browser bundles, `VITE_*` variables, public HTML or client logs.
- [DEVELOPER ACTION] Add per-user/IP rate limits, daily/monthly caps, usage logs, timeout handling, prompt-injection protections and a global kill switch.
- [DEVELOPER ACTION] Prevent CNIC images, customer PII, HR files, finance records, payment data and rental contracts from being sent to consumer AI providers.
- [OWNER ACTION] Approve which data AI may process and whether customer-facing AI disclosure is required.
- [OWNER ACTION] Add provider API keys directly to Cloudflare secrets only after reviewing the provider's current free-tier terms. No silent paid fallback.
- [BLOCKED] “Free tier” is not guaranteed unlimited or permanent; providers may change quotas, terms and data-use rules.

Optional tools to evaluate later: analytics (privacy-conscious), search console, transactional email, CAPTCHA/anti-abuse, image optimization, customer support inbox, shipping/courier tracking and accounting exports. Add only when there is a real operational need and the cost/privacy trade-off is acceptable.

## 8. Business information and content the owner must supply

### Company identity and public contact

- [OWNER ACTION] Confirm legal/business display name, trading name, registered address (if applicable), store/godown address and map pin.
- [OWNER ACTION] Confirm public phone/WhatsApp number, customer support email, business hours and holiday schedule.
- [OWNER ACTION] Confirm who may approve prices, discounts, refunds, rental bookings and customer complaints.
- [OWNER ACTION] Confirm the official social URLs and brand logo files; provide only approved brand assets.
- [OWNER ACTION] Confirm whether the site should use English only or Urdu + English for every customer-facing policy and checkout notice.

### Garments and wholesale catalogue

- [OWNER ACTION] Provide each real product's name, category, description, sizes, colours, grade/condition, actual brand/authenticity status, stock quantity, retail price, wholesale price/MOQ and product SKU/barcode.
- [OWNER ACTION] Provide original product photos/video from multiple angles and confirm permission to use them.
- [OWNER ACTION] Identify which products are imported branded lots, unbranded, surplus, used, new or otherwise; do not claim authenticity/grade without evidence.
- [OWNER ACTION] Confirm tax treatment, delivery areas, shipping charges, exchange eligibility and wholesale terms.
- [DEVELOPER ACTION] Import catalogue data only after the owner approves the final spreadsheet and field mapping.

### Vehicle rentals

- [OWNER ACTION] Provide vehicle make/model/year, registration details needed internally, approved public photos, availability, self-drive and with-driver rates, deposit, mileage/fuel rules, delivery/pickup charges and permitted travel areas.
- [OWNER ACTION] Approve driver eligibility, age/licence requirements, required documents, security deposit, cancellation and late-return policies.
- [OWNER ACTION] Confirm who is authorized to view CNICs and the lawful retention/handling policy.
- [DEVELOPER ACTION] Test rental pricing, availability overlap, required CNIC front/back upload, consent, secure storage and staff access on real devices.

### Legal and policy approvals

- [OWNER ACTION] Approve Terms & Conditions, Privacy Policy, Cookie/analytics notice, delivery policy, exchange/return policy, refund process, wholesale terms and rental agreement.
- [OWNER ACTION] Confirm the exact legal notice and business justification for collecting and retaining CNIC evidence, who can access it, and how customer requests/complaints are handled.
- [OWNER ACTION] Obtain local legal/accounting advice where required; software configuration is not legal certification.
- [DEVELOPER ACTION] Publish only owner-approved policy wording and keep revision/audit history.

## 9. Security, staff and operational acceptance

- [OWNER ACTION] Confirm the owner account and recovery contact are controlled by the business owner; enable MFA on Cloudflare, GitHub, Google, Meta, Resend and payment-provider accounts.
- [OWNER ACTION] Supply staff names, roles and business email/phone only when ready to create staff accounts.
- [DEVELOPER ACTION] Review least-privilege roles and confirm each role can only access its permitted modules and actions.
- [OWNER ACTION] Approve staff onboarding/offboarding and password/MFA rules.
- [DEVELOPER ACTION] Test admin login, customer login, session expiry/revocation, rate limiting, audit trail, CSRF/origin checks, security headers, upload validation and backup restore.
- [OWNER ACTION] Complete a real-device acceptance pass: Android Chrome, desktop Chrome/Edge, slow mobile connection, upload permissions, camera scanner, PWA install, forms and payment flows.
- [OWNER ACTION] Confirm the business has a support process for failed orders, payment disputes, delivery issues, rental incidents, privacy requests and complaints.

## 10. Current project status snapshot

| Area | Recorded status |
|---|---|
| GitHub main CI run #44338347005 | **Passed** (18 Nov 2026) |
| Cloudflare deployment for this work | **Not performed** — development is GitHub-only; final release/deploy is planned after all release gates close |
| Cloudflare Pages / D1 / private R2 architecture | Existing project architecture |
| CNIC permanent retention protection | Migration 0032 applied and metadata-update rejection verified |
| CNIC encrypted per-rental backup | Implemented; manual upload; recovery downloads files but does not reinsert into D1/R2 |
| Business-wide automated backup and full restore | Outstanding |
| Google Drive website OAuth upload | Not implemented |
| Google customer sign-in | Documented; not implemented |
| Microsoft customer sign-in | Documented; not implemented |
| Resend email queue | Implemented in code; provider configuration and real delivery test outstanding |
| WhatsApp POS receipt queue | Documented in README; live Meta credentials/template/delivery must be verified |
| Safepay | Sandbox adapter documented; no live transaction/onboarding verified |
| JazzCash / Easypaisa | Not confirmed integrated; owner/provider decision required |
| Bank transfer | No verified account details recorded |
| AI integration | Existing components/key manager; live provider configuration and data-safety acceptance outstanding |
| Real product/stock catalogue | Owner data required |
| Real vehicle fleet and rental rates | Owner data required |
| Legal policies and CNIC notice | Owner approval required |
| Real-device end-to-end acceptance | Outstanding |
| Production release | Not certified for unrestricted commerce |

## 11. Owner action register — fill in later

Do not send passwords or secret values here. Record only non-secret status, public IDs/URLs where appropriate, who owns the task, and the date verified.

| # | Owner task | Owner status / date / notes |
|---:|---|---|
| 1 | Confirm official production domain/hostname | Pending |
| 2 | Confirm Cloudflare and GitHub account ownership + MFA | Pending |
| 3 | Confirm Meta Business Portfolio, Facebook Page and Instagram account | Pending |
| 4 | Complete WhatsApp Business API setup, phone ID and approved receipt template | Pending |
| 5 | Verify Resend sender domain and choose owner notification inbox | Pending |
| 6 | Choose payment provider(s) and complete merchant onboarding | Pending |
| 7 | Supply bank-transfer details only if approved | Pending |
| 8 | Secure Google Drive business account and create restricted backup folders | Pending |
| 9 | Create Google Cloud OAuth client for Drive integration | Pending |
| 10 | Create Google sign-in OAuth client | Pending |
| 11 | Create Microsoft Entra app registration and choose account types | Pending |
| 12 | Decide AI use cases/provider and approve data restrictions | Pending |
| 13 | Supply approved garment catalogue, prices, sizes, stock and media | Pending |
| 14 | Supply vehicle fleet, rates, availability and rental rules | Pending |
| 15 | Approve privacy, exchange/refund, delivery, wholesale and rental policies | Pending |
| 16 | Confirm CNIC retention/access policy and authorized custodians | Pending |
| 17 | Complete encrypted backup uploads and offline second copy | Pending |
| 18 | Complete a non-production disaster recovery drill | Pending |
| 19 | Approve staff accounts and role assignments | Pending |
| 20 | Complete real-device business acceptance | Pending |
| 21 | Explicitly authorize release by saying “deploy now” | **Authorized by user on 18 Nov 2026** — execute only after backup, schema migrations, green CI and final preflight pass |

## 12. Safe credential handover procedure

1. Developer supplies the exact variable/secret name and the correct Cloudflare project/environment.
2. Owner opens Cloudflare Dashboard → Workers & Pages → De VERVE Pages project → Settings → Variables and Secrets (wording may vary).
3. Owner enters secret values directly in Cloudflare as encrypted secrets; plain configuration values are added as non-secret variables only when appropriate.
4. Owner confirms only the **name is configured**—never sends the secret value back.
5. Developer verifies the integration through a safe status endpoint or low-risk test that does not reveal the secret.
6. Rotate/revoke credentials immediately if exposed. Never commit credentials to GitHub or put them in this tracker.

**No deployment is implied by configuring a secret.** A later owner-authorized release may be required for Pages Functions to consume changed environment configuration.

---

## 13. Change log

- **18 Nov 2026:** Latest documented identity-provider and platform architecture notes are on `main`; CI run #44338347005 passed. No Cloudflare deployment was performed. Added this owner setup register to keep pending owner inputs and developer work in one place.
- **18 Nov 2026:** README records production CNIC immutability migration 0032 applied and verified. Do not delete or overwrite originals.


### CI verification follow-up — 18 Nov 2026

- Owner tracker commit `5cdec943b8de327f634b30cc74064ad6234f2ca9` passed GitHub Actions run [#44341083529](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44341083529). All 16 steps completed successfully, including TypeScript/build, production dependency audit, Pages security-header artifact validation, Worker authentication tests, D1 schema validation and storefront browser tests.
- README tracker-link commit `b9f1c8ac7ee874e4b6f98d7f0b7976822beaba0f` passed GitHub Actions run [#44341122641](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44341122641).
- These were source/CI checks only. No Cloudflare deployment, production migration, secret change, live provider delivery, payment transaction or data mutation was performed.


### Live D1 schema audit correction — 18 Nov 2026

A read-only query of the live `deverve-production` D1 database found that the earlier tracker entry was incomplete:

- `enquiry_email_queue` is absent, so migration `0029_enquiry_email_queue.sql` is pending.
- `pos_sales` does not have `customer_email`, `email_receipt_requested`, or `whatsapp_receipt_consent`, and `pos_receipt_outbox` is absent, so migration `0030_pos_receipt_delivery.sql` is pending.
- `idx_enquiry_email_queue_lease` cannot exist because its table is absent, so migration `0031_enquiry_email_queue_lease_index.sql` is pending.
- The CNIC immutability triggers from migration `0032_permanent_cnic_evidence.sql` are present.
- Production has no migration-ledger table; migration state is checked from actual schema objects.
- This was a read-only inspection. No production rows, schema, secrets, R2 objects or deployment were changed.

**Release order:** fresh verified encrypted D1 export and independent copy → re-check live schema → apply 0028 → verify → apply 0029 → verify → apply 0030 → verify → apply 0031 → verify → apply 0033 → verify → verify CNIC guards remain present → deploy matching source → run production smoke and targeted business acceptance. D1 export does not include private R2 image bytes. CNIC originals remain permanent and must never be deleted, overwritten, renamed or expired.

**CI:** the current source checkpoint commit `d82bb53f861f9e37d7cd7f1cd9a8dcfe4a9a0fa5` passed GitHub Actions runs [#44342786822](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44342786822) and [#44342842399](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44342842399). This does not substitute for live provider tests or migration release.


### Owner notification queue repair — 18 Nov 2026

The Worker audit identified a production schema mismatch in the owner email notification processor. The code was using a missing `notification_outbox.processing_started_at` column and had an incorrect SQL binding count. The source has been repaired and a regression test plus schema assertion have been added. New migration `0033_notification_outbox_lease.sql` is required after 0029–0031. Production currently lacks this column and index; do not deploy the repaired Worker until 0033 is applied and verified. This migration is additive and preserves existing notification rows.


### Additional live schema gap — migration 0028 — 18 Nov 2026

Read-only production inspection confirms `enquiries.contact_type` is absent. The current Worker inserts this field for every website enquiry; the insert fails and the endpoint returns HTTP 503 when the column is missing. This is a live functional blocker, not just a future enhancement. Migration `0028_enquiry_contact_types.sql` must be applied first, followed by 0029, 0030, 0031 and 0033. The checked product colour, SEO, rental pricing, customer, AI-key, review and rental preview-token schema is present. Migration 0032's CNIC guards are already present and must remain untouched.


### POS release compatibility — 18 Nov 2026

Migration 0030 is critical for the current POS handler. The current Worker always inserts the receipt contact/consent columns in `pos_sales` and writes optional `pos_receipt_outbox` rows. The live schema has neither, so a matching Worker deployment before 0030 would break POS sale creation. Do not deploy until 0030 is applied and read-back verified.
