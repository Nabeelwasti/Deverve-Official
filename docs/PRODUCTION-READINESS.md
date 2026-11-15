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
| Medium | Customer lifecycle | Customer registration/sign-in, secure sessions, profile/password changes, account-scoped order/rental history and order-status timeline are implemented. Email verification, email-based password recovery, returns/refunds automation, payment gateway and transactional notifications are not connected. | Advertise only the working account and tracking functions. Do not claim email verification, password recovery, online payment or automated refunds. |
| Medium | Domain and SEO | The site uses the shared Pages hostname. Product detail views are not dedicated indexable product URLs. | Connect the business domain and later add canonical product routes, structured data, and per-product metadata. |

## Explicit operating boundaries

- Cash on Delivery is the only checkout method. No online payment provider is connected.
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
- A deverve-cnic-retention scheduled Worker is configured with the production D1 and private R2 bindings, running daily at 03:00 UTC. It clears expired one-time upload tokens and purges documents 30 days after a rental request is marked completed or cancelled, recording audit entries. The first scheduled execution and actual R2/D1 deletion have not yet been observed; CNIC uploads must remain disabled until this runtime check is complete.
- GitHub Actions run #268 passed build/type checks, Worker tests, schema validation and four desktop/mobile Playwright tests with a mocked Turnstile script and mocked APIs. This proves integration wiring and form behavior only; it does not prove real challenge verification or live order/payment transactions.
- Later commits adding the bilingual policy page and owner CNIC setting are still awaiting the latest CI run and post-deployment smoke check at the time this note was written.

### Remaining work and external dependencies

- Email verification and secure password recovery require a transactional email provider; the current account flow clearly discloses that these are not active.
- Payment gateway processing, refunds and reconciliation require merchant approval, sandbox/live credentials and signed webhook verification.
- A Pakistan-supported payment provider, merchant approval, sandbox/live credentials, signed webhooks, refunds and reconciliation.
- Transactional email domain/provider and templates.
- SMS provider and WhatsApp Business Platform account, approved templates and message pricing.
- Real D1/R2 integration tests, actual Turnstile challenge tests, real-device acceptance and the first scheduled CNIC cleanup verification.
- Owner confirmation/legal review of the public policy wording, especially returns/exchanges, rental deposits, cancellation, liability and document retention.
- Verified products, variants, stock, fleet and prices remain intentionally empty until the owner adds them.

**Current verdict: not yet certified for unrestricted production commerce.** The free Cloudflare Pages hostname and free hosting remain suitable for the current build stage; a custom domain is optional, not a blocker.

## Verification notes — 15 November 2026

- Production smoke run #30 passed: live Pages health and D1 connection, Turnstile verifier health and secret binding, a negative Siteverify request (invalid token rejected), CNIC retention worker health with D1 and private R2 bindings, and deployed security headers.
- The CNIC cleanup Worker source is maintained at workers/deverve-cnic-retention.js; its health endpoint is checked in production smoke. Unit coverage is in scripts/cnic-retention.test.mjs. The cron trigger is 03:00 UTC daily. Runtime deletion of a real document is intentionally not tested because production contains zero rental documents.
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

The site is still **not certified for unrestricted production commerce**. Payment provider onboarding, email/SMS/WhatsApp delivery, refunds/returns operations, real-device business acceptance, legal/policy approval and owner-supplied inventory/fleet data remain open.
