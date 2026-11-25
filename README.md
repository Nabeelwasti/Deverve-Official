# De VERVE — Commerce & Business Operations Platform

Mobile-first fashion, wholesale and vehicle-rental storefront with a role-based business operations workspace for De VERVE, Jhelum, Pakistan.

## Live environment

- Storefront: https://deverve-official.pages.dev/
- Admin: https://deverve-official.pages.dev/admin
- Customer account: https://deverve-official.pages.dev/account
- Source: https://github.com/Nabeelwasti/Deverve-Official
- Production branch: `main` only
- Hosting: Cloudflare Pages project `deverve-official`
- Database: Cloudflare D1 `deverve-production` (APAC)
- Media: private Cloudflare R2 `deverve-media-private`
- **Latest merged engineering release:** PRs [#56](https://github.com/Nabeelwasti/Deverve-Official/pull/56)–[#61](https://github.com/Nabeelwasti/Deverve-Official/pull/61) are merged. They add offline POS integration hardening, production smoke coverage, encrypted D1/R2 backup verification and recovery runbooks.
- **Latest verified main CI:** run [#45520354785](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45520354785) passed, including type-check/build, dependency audit, offline POS tests, isolated D1 checks, migration rehearsal and storefront browser tests.
- **Latest production deployment:** Cloudflare Pages deployment [2cdb7e70](https://2cdb7e70.deverve-official.pages.dev) completed successfully from main commit `48f4bc7cba5780686e8022bc4a71cbfc5b878f68`. Automatic Pages deployments remain disabled; production changes require a controlled release.
- **Latest encrypted backup:** run [#45517680549](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/45517680549) verified a 66-table D1 restore and encrypted R2 media read-back. The 25 Nov historical media snapshot contains 38 catalogue objects and 2 legacy CNIC images; new routine snapshots in the hardening branch exclude `rental-private/`.
- **Current hardening PR:** [#62](https://github.com/Nabeelwasti/Deverve-Official/pull/62) is the review branch for mandatory Turnstile, public stock minimisation, scheduled outbox processing, 24-hour COD reservation expiry, owner/manager CNIC clearance plus 90-day retention, AI-action confirmation, 30-minute admin idle timeout, separated application keys and CI hardening. Its migrations `0050`–`0053` are not yet applied to production.
- **Offline POS release gate:** offline checkout remains disabled, production migrations `0045`–`0049` remain unapplied, and the online POS remains authoritative. Do not enable offline checkout until the full Worker-to-isolated-D1 runtime test, signing-key custody and owner/device acceptance are complete.
- **CNIC production gate:** the approved operating rule is 90 days after an authorised owner or manager records final clearance of all payments, deposits, damages, fees, challans and related obligations. The production R2 indefinite lock remains in place until migration `0050`, the scheduled Worker and its health check are verified; the gated workflow then removes only that reviewed lock rule. Legacy records are not auto-cleared.
- **Recovery and operations:** same-account encrypted backup/restore is verified. Independent off-account/offline recovery and separate key escrow are deferred until the business domain and email are established. Branch protection, least-privilege token replacement, provider credentials, catalogue/fleet reconciliation and real-device acceptance remain release gates.
- **Production acceptance is not complete.** The full Worker-to-Cloudflare-D1 runtime probe previously received HTTP 403 for temporary Worker deployment. Customer email verification/password reset also require a verified business sender. See [the production-readiness record](docs/PRODUCTION-READINESS.md), [the production acceptance matrix](docs/PRODUCTION-ACCEPTANCE-MATRIX.md) and [the CNIC retention implementation](docs/CNIC-RETENTION-IMPLEMENTATION.md).

## Release documentation

- [Multilingual AI speech architecture and device-acceptance checklist](docs/AI-VOICE.md)
- [Current production-readiness record and remaining release gates](docs/PRODUCTION-READINESS.md)
- [nopCommerce capability comparison and safe DeVErve adaptation plan](docs/NOPCOMMERCE-ARCHITECTURE-REVIEW.md)

## Implemented

> Release note: the source contains substantial implemented functionality, but live production acceptance remains blocked by the outstanding gates below. UI presence and a passing build do not prove a provider, backup, payment or physical-device workflow is operational.

### Storefront and commerce
- Responsive fashion, wholesale, car-rental, contact and bilingual policy pages.
- Product catalogue with search/filtering, dedicated `/product/:slug` routes, galleries, favourites and cart.
- Server-side price/stock validation, stock reservations and duplicate checkout protection.
- Cash-on-delivery checkout with delivery-fee quotation and a 48-hour customer approval/decline flow.
- No automatic spend-tier or advance-payment discounts are applied. Only explicitly configured, customer-eligible voucher codes are considered, and eligibility/discount amounts are calculated server-side.
- Wholesale enquiries, staff quotations, customer approval links and conversion to stock-reserved COD orders.
- Vehicle catalogue and rental request flow with Pakistan-time validation and overlap checks for confirmed bookings.
- Contextual WhatsApp contact links and installable PWA shell.

### Customer accounts and service
- Customer registration/sign-in, profile and password changes.
- Customer-scoped order and rental history and order-status timeline.
- Exchange-only customer policy with a dedicated in-site workflow: eligible delivered orders can submit item-level requests within seven days of the actual delivery event; customers can track status and authorised staff can review, approve/reject, record receipt and complete cases. Replacement stock is still confirmed by staff before fulfilment.
- New customer return submissions are rejected. Historic return/refund records remain for legacy administration only.

### Admin and business operations
- Owner bootstrap/login, hashed server-side sessions, login throttling, role-based staff invitations and full-history audit search with server-side filtering and pagination.
- Owner-only staff creation and permission changes; managers cannot grant themselves owner privileges.
- Product, variant, stock, inventory movement, media and vehicle management. Inventory, POS, expenses, customer order invoices, delivery slips, rental request summaries and wholesale quotations support branded XLSX/DOCX, CSV, JPG and browser print-to-PDF exports where shown in the relevant workspace. The shared Word, Excel and image export engine embeds the actual De VERVE logo; CSV remains text-only by format design. Admin → Inventory can also generate printable Code 128 labels from each variant's saved barcode, falling back to its SKU; POS lookup matches either value.
- Orders, delivery quotations, wholesale, rental requests, customer CRM, enquiries and follow-up inbox.
- Block-based CMS workspace for pages, sections, navigation, draft/publish/archive, revision snapshots and audit events.
- Product SEO title/description, canonical and Open Graph metadata, Product JSON-LD, dedicated product routes and dynamic sitemap.
- Owner-only in-app notification inbox and owner-managed primary/secondary email recipient settings.
- Owner-managed customer payment methods: COD, bank transfers, mobile wallets (including SadaPay/JazzCash/Easypaisa account details), hosted HTTPS payment links and uploaded QR images. Each method can be added, edited, activated or disabled from Website Settings; checkout exposes enabled methods only.
- Direct-transfer orders record the selected payment method and remain unpaid until the owner independently verifies receipt. Staff cannot mark payments paid; fulfilment is blocked until verification.
- Resend notification outbox with retry/audit records. Contact-form enquiry emails and transactional POS customer receipt emails are queued for delivery when a verified sender and Resend API key are configured.
- POS customer receipts can also be queued to WhatsApp after recorded WhatsApp opt-in. Delivery uses the Meta WhatsApp Cloud API and an owner-approved utility message template; no messages are sent without the matching consent flag. POS history shows per-channel delivery status and authorised staff can retry failed receipts.
- Owner-managed brand assets and social profile URLs.

### POS receipt delivery setup

- The customer email field is for a transactional invoice copy; entering an email address queues the receipt automatically. WhatsApp delivery is separate: Meta requires the customer to have provided their number and opted in to messages from De VERVE. The cashier records that permission before the WhatsApp channel is queued.
- Email receipts use the existing Resend provider. Configure RESEND_API_KEY as an encrypted Cloudflare Pages Secret and RESEND_FROM_EMAIL as a plain-text variable containing the verified sender address.
- WhatsApp receipts use Meta's WhatsApp Cloud API. Configure WHATSAPP_ACCESS_TOKEN as an encrypted Secret; set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_RECEIPT_TEMPLATE and WHATSAPP_RECEIPT_LANGUAGE as plain-text variables. WHATSAPP_API_VERSION is optional and defaults to v27.0.
- Create and get Meta approval for a Utility template named to match WHATSAPP_RECEIPT_TEMPLATE. Its body must contain three positional placeholders in this order: customer name, receipt number, and total. Suggested body: “Hello {{1}}, thank you for shopping with De VERVE. Your receipt {{2}} totals {{3}}. Please keep this message for your records.”
- Receipt requests are written to a retryable D1 outbox in the same transaction as the sale. Provider credentials are never stored in D1. Queued receipts are retried with bounded backoff; delivery remains pending until provider setup, template approval and valid WhatsApp opt-in is recorded.
- Meta template messages are sent only to the phone number supplied for that sale and only when the cashier records the customer's explicit WhatsApp consent. A manual WhatsApp share link remains available as a fallback.

### Security and infrastructure
- Cloudflare Pages Functions, D1 and private R2.
- Server-side role checks, hashed random session tokens, HttpOnly/Secure/SameSite=Strict cookies and same-origin mutation checks.
- Cloudflare Turnstile verification through a separate Worker and D1-backed public rate limits.
- Security response headers and Content Security Policy.
- Production still runs the previous scheduled CNIC Worker, which expires temporary upload tokens only. The new 90-day owner/manager-clearance workflow is implemented in PR #62 but is not yet production-enabled. Existing D1 guards and the indefinite R2 Bucket Lock remain in place until migration `0050` and the new Worker health check pass; only then does the gated deployment workflow remove the reviewed lock. The managed public r2.dev domain is disabled.
- GitHub Actions build, type-check, Worker tests, schema checks and desktop/mobile browser tests.

## Owner setup checklist — email, WhatsApp and permanent CNIC evidence

### Resend email delivery

1. Create the business sending address on a domain De VERVE owns (for example, receipts@your-owned-domain). A free Gmail address is not a substitute for domain verification.
2. Create a Resend account and add the owned domain under Domains.
3. Copy the exact DNS records Resend provides (SPF and DKIM; add the recommended DMARC record) into the domain's DNS provider. Do not invent or reuse sample DNS values. Wait until Resend shows the domain as Verified.
4. In Resend → API Keys, create a production key restricted to sending from the verified domain if the account offers that restriction. Copy it once; do not place it in GitHub or send it in chat.
5. In Cloudflare → Workers & Pages → deverve-official → Settings → Variables and Secrets → Production, add RESEND_API_KEY as an encrypted Secret and RESEND_FROM_EMAIL as the verified sender address (plain address only, e.g. receipts@your-owned-domain).
6. Add the same RESEND_API_KEY secret and RESEND_FROM_EMAIL variable to the separate scheduled Worker `deverve-outbox`. Pages project variables are not automatically shared with a standalone Worker; without these Worker bindings, queued emails remain pending.
7. In Admin → Website & brand settings, set the primary owner notification email to a business-owned inbox. No recipient is configured by default; owner alerts and enquiry emails remain queued until a valid business address is saved. A customer email entered as the invoice-copy address queues a transactional receipt; it is not a marketing subscription.
8. After the owner authorises deployment, send a controlled test invoice to an address the owner controls and verify delivery, retry handling and sender authentication.

### Meta WhatsApp Business delivery

1. Use a Meta Business Portfolio owned by De VERVE. Add or select its WhatsApp Business Account.
2. Register a dedicated business phone number in WhatsApp Manager. It must be verified by SMS or voice and must be eligible for the Cloud API. A number currently used in the regular WhatsApp app may need migration.
3. In Meta for Developers, create a Business app, add the WhatsApp product, and complete the Cloud API setup. Record the **Phone Number ID** (not the visible phone number).
4. Create a System User in Business Settings, assign the WhatsApp account/phone asset, and generate a production token with the WhatsApp messaging permissions required by Meta. Keep the token private.
5. In WhatsApp Manager → Message templates, create a Utility template named deverve_pos_receipt in English (US), with this body and three placeholders in exactly this order: “Hello {{1}}, thank you for shopping with De VERVE. Your receipt {{2}} totals {{3}}. Please keep this message for your records.” Submit it and wait for Meta approval.
6. In the Pages Production Variables and Secrets screen, add WHATSAPP_ACCESS_TOKEN as an encrypted Secret; WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_RECEIPT_TEMPLATE=deverve_pos_receipt and WHATSAPP_RECEIPT_LANGUAGE=en_US as variables. WHATSAPP_API_VERSION is optional; the code has a default.
7. Add the same WhatsApp token and template variables to the separate scheduled Worker `deverve-outbox`; standalone Workers do not inherit Pages environment variables.
8. At checkout, staff may tick the WhatsApp receipt option only after the customer has actually agreed to receive the transactional receipt on WhatsApp. A supplied phone number alone is not opt-in. Do not use this channel for promotions unless the separate marketing permission is obtained.
9. After deployment is authorised, test only with a business-controlled, opted-in number first. Confirm the provider message ID and delivery status before enabling normal use.

### 90-day CNIC retention policy and controlled deletion

1. The hardening branch requires a completed rental and explicit owner/manager final clearance confirming payments/deposits, damage claims, challans/fines, fees and disputes are settled. The 90-day clock starts at the recorded approval timestamp; vehicle return alone is insufficient.
2. The owner/manager can place a documented legal/business hold. An active hold blocks deletion even after the 90-day deadline and requires a recorded release decision.
3. The scheduled CNIC Worker deletes only the two private R2 evidence objects and their D1 metadata after the due date and with no active hold. A separate database trigger permanently preserves rental business history.
4. Production migration `0050` and the Worker must be deployed and health-checked before the workflow removes the existing indefinite R2 lock rule. Until then, production keeps the current lock and no CNIC object is deleted.
5. Legacy rentals remain uncleared until an authorised owner/manager explicitly records approval; no historical clearance date is inferred.

## Historical production snapshot — 16 November 2026 (not a current live read-back)

Latest source on `main`: `de877981554ad52ee8929330ff6b76828df1831b`. GitHub Actions run #838 passed the full build, production audit, Worker tests, D1 schema checks and browser tests. The current source changes are GitHub-only; no Cloudflare deployment or production D1 migration has been run. The current application remains React 19 + TypeScript + Vite on Cloudflare Pages/Pages Functions, Cloudflare D1 and private R2. No replacement project, database, or branch was created.

CI run #590 passed all 13 steps: type-check/build, security-header output, Worker authentication tests, D1 schema/constraint validation, and desktop/mobile Playwright browser tests. Production smoke run #302 passed all eight checks: production health/D1 connectivity, protected exchange/return routes, CMS/SEO/sitemap/notification routes, Turnstile verifier/Siteverify connectivity, scheduled CNIC-retention service bindings, rental settings/fleet pricing, and deployed security headers. Cloudflare Pages production deployment for this commit completed successfully.

The following table is a historical read-back from 16 November 2026. It is not a current live read-back and must not be used as proof of today's production state. This continuation did not query or mutate Cloudflare production.

| Record type | Current count |
|---|---:|
| Active owner accounts | 1 |
| Media assets | 7 |
| Products / variants | 1 / 1 |
| Vehicles | 1 |
| Customers / orders | 0 / 0 |
| Rental requests | 1 |
| Owner notifications | 1 |
| Exchange requests | 0 |
| CMS pages | 0 |
| POS sales | 0 |

Use direct SQL against `sqlite_master` for table counts. Cloudflare's D1 metadata `num_tables` field has returned 0 despite the tables being present.

## What is actually active

- **Checkout:** COD and owner-configurable direct payment instructions are supported. The owner can publish bank/wallet details, IBANs, hosted HTTPS links and QR images from Website Settings. Direct transfers stay pending until the owner independently verifies receipt.
- **Safepay:** The gateway adapter exists, but no merchant credentials or successful sandbox/webhook transaction have been verified. Keep dynamic Safepay checkout disabled until onboarding and reconciliation tests pass.
- **PayFast:** Not integrated as a dynamic per-order gateway. Obtain the official merchant-specific hosted OneCheckout contract and credentials first. Never collect card numbers or CVV on De VERVE pages.
- **Email:** Owner alerts, contact-form enquiries and transactional POS invoice copies have retryable queues. A customer email supplied as the invoice-copy destination is used for that receipt only. Actual delivery still requires a verified sender address/domain plus `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
- **WhatsApp:** POS receipt delivery is implemented through the Meta Cloud API, but it remains inactive until the owner configures `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, an approved `WHATSAPP_RECEIPT_TEMPLATE`, and its language. The customer must explicitly opt in before the POS queues a WhatsApp receipt. Other customer contact links remain manual. SMS is not connected.
- **Automatic receipt attachments:** POS email receipts currently send a branded HTML invoice body, and WhatsApp sends the approved Utility template body. The admin can download/print invoices in PDF, Word, Excel or JPG where offered, but automatic PDF/JPG attachments and per-sale send-format selection are not yet implemented.
- **Social accounts:** Public profile URLs can be stored. OAuth, publishing, inbox management, ad management and analytics imports are not part of this website.
- **Domain:** The production site uses the Cloudflare Pages hostname. No custom domain is connected.
- **Customer email lifecycle:** Email verification and email-based password recovery are not active.
- **CNIC:** Both sides and customer consent are required when uploads are enabled. Stored documents remain private until authorised final clearance, then for 90 more days; documented legal/business holds pause deletion. On 18 November 2026, production D1 was verified to contain one rental request and two CNIC document records; the additive 0032 protection triggers were applied and read back, and a no-op metadata update was rejected without changing the document count. Cloudflare read-back also confirmed the enabled indefinite R2 Bucket Lock rule `deverve-rental-cnic-indefinite` for `rental-private/`. The private bucket has no enabled public r2.dev domain or custom public domain. The 90-day retention Worker is implemented in the hardening branch but is not production-enabled until migration `0050` and the gated deployment complete. An independent encrypted off-account backup and restore test are still outstanding.
- **Business data:** One product with one stock variant and one vehicle are currently present, alongside seven media assets and one rental request. Do not overwrite or delete these records. The catalogue and fleet still need the owner's complete, verified product, price, stock, vehicle, availability and photo information.

## Latest code and regression coverage

- Turnstile now reports ready only after its challenge iframe mounts. A stalled render produces a clear error and retry action.
- Rental settings failures show the server-provided reason and a retry action; stale settings responses cannot overwrite a newer request.
- Native required-field validation and blocked Turnstile submissions have visible notification coverage.
- Rental date fields, duration and estimates use Asia/Karachi time regardless of the visitor's device timezone. Timezone-less form values are sent to the Worker, which parses them as Pakistan wall-clock time.
- Browser tests cover the stalled/blocked challenge, settings retry, mandatory CNIC, rental estimate, cross-timezone date handling, product gallery rotation and colour-specific image filtering, and vehicle gallery rotation/manual navigation.
- Product and vehicle gallery managers already support batches of up to 50 images (with per-gallery limits), colour-specific product media, manual navigation and automatic rotation.

## Remaining release blockers

1. Complete and verify the product catalogue, exact sizes/colours/variants, retail and wholesale prices, stock, and genuine product photos.
2. Complete the vehicle fleet, self-drive/with-driver rates, availability, photos and owner-approved rental terms.
3. Confirm the business phone/WhatsApp, address, email, opening hours, delivery coverage/fees and wholesale minimums.
4. The owner-selected operating policy is 90 days after authorised owner/manager final clearance. The production implementation remains release-gated until migration `0050`, the Worker health check and the R2 lock transition are verified. Qualified Pakistan legal review is still required before describing the policy as legally compliant.
5. Configure real bank/wallet accounts, account titles, account numbers/IBANs, hosted URLs and QR images, then test checkout and manual reconciliation without using fake production transactions.
6. Configure Safepay sandbox merchant credentials and complete an end-to-end sandbox payment plus webhook/reconciliation test before considering live onboarding.
7. Obtain PayFast merchant-specific hosted OneCheckout documentation and credentials before implementing or enabling that provider.
8. Configure a verified sender domain, Resend API key and sender address; test delivery, failure handling and retries.
9. Deploy and verify migration `0050` plus the 90-day CNIC Worker before removing the indefinite R2 lock through the gated workflow. Establish independent encrypted offsite recovery when the business domain/email is ready.
10. Complete real-device acceptance on Android/iOS and desktop, including a real visible Turnstile challenge. Playwright mocks the challenge/API and does not replace a real human challenge or real transaction.
11. Decide whether customer email verification/password recovery and SMS are required. POS WhatsApp receipts are implemented but require Meta credentials, an approved Utility template and explicit customer opt-in; SMS is not implemented.
12. Connect a custom domain only when the owner supplies a domain they control and DNS access.

Do not call the site unrestricted-commerce-ready until the relevant owner/provider/data gates above are closed. Never fabricate credentials, payment confirmations, customer records, catalogue data or vehicle availability.

## Local development and verification

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run check
npm run test:worker
python scripts/verify_schema.py
npm run test:e2e
```

Use reviewable branches and pull requests. Never force-push, reset, or discard existing work. Keep secrets and private customer/business data out of GitHub and chat. Treat implemented, tested, deployed and live as separate states.


### Rental booking and identity verification

- Rental requests require the front and back of the customer CNIC in the same multipart submission. The Worker validates file type/signature and size, then stores images in private R2 and metadata in D1. A request is not accepted unless both document records are committed.
- Authorised rental staff can preview/download private CNIC images through authenticated, audited admin routes. Production currently retains the existing indefinite R2 Bucket Lock; the 90-day clearance/hold workflow and its database guards are in PR #62 and remain gated until migration `0050` and Worker deployment are verified. An owner/staff encrypted offline backup and recovery control is available per rental: it uses browser-native PBKDF2-SHA-256 and AES-256-GCM, sends no CNIC image to an external service, and requires a user-managed password. Downloaded `.dvbackup` files must be stored outside the Cloudflare account, with the password stored separately. Recovery downloads original image files and a manifest locally; it does not reinsert records into production D1/R2. This is a manual backup workflow, not automatic off-account recovery.
- Vehicle pricing supports a self-drive daily rate and an optional separate with-driver daily rate. Both rates must be explicitly configured before a vehicle can be published as available. The server independently calculates full 24-hour days (rounded up), daily rate and total; browser estimates are only a preview.
- Available vehicles must have a self-drive rate. Add vehicles and both rate options in Admin → Vehicle fleet before expecting an automatic price estimate. If no vehicle is selected, the rental team must quote manually.


## Secure business backups

See [Secure backup and recovery operations](docs/SECURE-BACKUP-OPERATIONS.md) for the owner procedure covering encrypted CNIC evidence files, Google Drive and Dropbox storage under `deverve61@gmail.com`, D1 SQL exports, recovery boundaries and restore drills. CNIC images must never be sent as ordinary email attachments or placed in public/shared links. Google Drive upload is currently manual; no Google OAuth connection or unattended upload is configured. Dropbox is connected to ChatGPT, but this does not authorize the De VERVE website to upload to Dropbox.


## Owner setup and external integrations

Use [`docs/OWNER-SETUP-AND-HANDOVER-TRACKER.md`](docs/OWNER-SETUP-AND-HANDOVER-TRACKER.md) as the single checklist for owner-supplied details and approvals, including Meta/Facebook/Instagram, WhatsApp, Resend email, payment-provider choice, Google Drive backups, Google/Microsoft sign-in, AI provider decisions, business data, legal approvals and release acceptance. It distinguishes verified repository implementation from owner actions and unfinished developer work. Never place secrets in the tracker, GitHub, or chat.


## Production handover and pending owner actions

The current engineering and owner-side release checklist is maintained in [docs/OWNER-HANDOVER-PENDING.md](docs/OWNER-HANDOVER-PENDING.md). It records business data/policy decisions, provider account setup, physical device and live-provider acceptance, backup/restore drills, migration release gates and remaining engineering tests. Keep credentials and personal/customer evidence out of GitHub; use provider secret settings. A green CI run is not production acceptance.


## Live website translation

The storefront language selector translates visible page copy in place through the private Cloudflare Workers AI service. It supports Urdu, Hindi, Arabic, Bengali, Persian, Turkish, Indonesian, Malay, Chinese, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, Thai, and Vietnamese. Customers can return to the original English copy at any time. Translation is cached locally in the visitor's browser.

The translation backend is isolated in `workers/site-translation/index.js`, deployed as the private `deverve-site-translation` Worker, and called through the Pages `TRANSLATION` service binding. It uses AI4Bharat IndicTrans2 for Urdu, Hindi, and Bengali, and `@cf/meta/m2m100-1.2b` for other supported languages. The De VERVE brand name is protected from translation. The Pages endpoint applies same-origin validation, per-visitor rate limiting, a shared 20-inference UTC daily cap, and a 600-character request limit before inference. The private Worker has public workers.dev and preview URLs disabled.

See [Live translation architecture and operating limits](docs/SITE-TRANSLATION.md) before changing supported languages, model selection, or usage ceilings. The application ceiling is conservative but is not a provider-side billing guarantee; the 10,000-neuron free allocation is shared with other Workers AI workloads in the same account. Monitor actual Workers AI usage in Cloudflare.
