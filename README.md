# De VERVE — Commerce & Business Operations Platform

Mobile-first storefront and admin system for De VERVE, Jhelum, Pakistan.

## Live environment

- Storefront: https://deverve-official.pages.dev/
- Admin: https://deverve-official.pages.dev/admin
- Source: https://github.com/Nabeelwasti/Deverve-Official
- Hosting: Cloudflare Pages
- API: Cloudflare Pages Functions / Worker handler
- Database: Cloudflare D1 (`deverve-production`, APAC)
- Media: private Cloudflare R2 bucket; public media is delivered only through the Worker authorization route.

## Implemented workflows

### Storefront
- Screen-based responsive navigation, product catalogue, search/filtering and product details.
- Product galleries with multiple images and MP4/WebM videos.
- Favourites and a browser-persisted retail cart.
- Server-validated COD checkout with current price/stock checks, stock reservations and duplicate-submission protection.
- Wholesale enquiries and customer-approved quotations that convert into stock-reserved COD orders.
- Available vehicle catalogue and rental request form with full pickup/destination city and address details.
- Rental CNIC uploads are disabled by default. Rental enquiries can be submitted without identity documents; no upload token is issued until the owner approves a retention policy and configures the explicit enable flag.
- WhatsApp contact using the business-approved number, email links, editable social profile links, owner-managed logo/favicon and developer credit.
- Installable PWA shell; API/customer data is deliberately excluded from offline caching.

### Admin
- Owner bootstrap/login, hashed server-side sessions, login throttling, logout and audit records.
- Role-based staff invitations, access changes and account disabling.
- Product create/edit/publish/archive, variants, inventory movements and stock history.
- Media library, multiple product images/videos, product cover selection and vehicle photos.
- COD order management, wholesale quotations and approval links.
- Fleet and rental request management, overlap checks and private rental-document access/deletion.
- Customer enquiries and owner-only website branding/social-link settings.

## Important operating limits

These are deliberate boundaries, not fake features:

- Checkout currently exposes **Cash on Delivery only**. A Safepay Express Checkout sandbox adapter and signed webhook reconciliation are implemented, but disabled because the production environment has no sandbox credentials. No real sandbox transaction has been completed. Do not enable live payments until merchant onboarding, live keys, webhooks, refunds and reconciliation are tested.
- Retail COD delivery fees are prepared by staff and must be accepted through a 48-hour customer approval link before processing or dispatch. Declining the quote cancels the order and releases reserved stock.
- Email notifications are not enabled. The Cloudflare account currently has no custom sending domain onboarded. The contact/enquiry and order records are saved in the admin database; customers can still use the website's email and WhatsApp links.
- Social settings store public profile URLs only. OAuth account connections, automated publishing, inbox access, ad management, analytics imports and autonomous social actions are not implemented.
- There is no customer login portal, self-service order tracking or product-review system yet.
- A full visual CMS/page builder and complete editable SEO/navigation management are not yet implemented.
- The official De VERVE logo and favicon are uploaded to private R2 and selected in the public brand settings. The owner must still confirm these are the final approved brand assets.
- The production database currently contains no real products, variants, stock, vehicles, orders or rental records. Add verified business data before advertising availability or accepting real orders.
- Delivery fees, delivery coverage, returns/exchanges, wholesale minimums, vehicle rates, rental terms, privacy/retention policy and business hours must be confirmed by the owner.
- A custom domain is not connected. The current live address is the Cloudflare Pages domain. Security response headers and a Content Security Policy are defined in the Pages _headers file; verify the deployed response and all application assets after release.

## Security and data handling

- Admin routes enforce server-side authentication, role permissions and same-origin checks for mutations.
- Admin and customer sessions use hashed random bearer tokens, HttpOnly, Secure, SameSite=Strict host-only cookies and server-side revocation.
- Customer registration uses Turnstile and a 12-character minimum password. Account profile/password changes and order/rental history require a valid customer session. Customer orders are queried by authenticated customer ID, not a caller-supplied order ID.
- Product/order stock is checked on the server; the browser is never trusted for final price or stock.
- R2 is private. Public media delivery checks that the media is assigned to a published product, available vehicle or selected public brand setting.
- CNIC uploads are **disabled by default**. The rental API does not issue upload tokens unless the Cloudflare Pages environment flag `CNIC_UPLOADS_ENABLED=true` is explicitly configured. Do not enable it until the business approves and publishes a retention/deletion policy and an automated expiry/purge process. When enabled, documents use private R2 storage and one-time upload tokens.
- Public enquiries, checkout, rental requests and CNIC uploads have atomic D1-backed per-IP rate limits. Raw client IP addresses are not persisted. These limits are a baseline control, not a substitute for Turnstile or bot mitigation against distributed traffic.
- Do not store payment card data. Keep secrets out of source control.
- Never invent products, prices, stock, reviews, vehicle availability, brand-authenticity claims or customer records.

## Local development and verification

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
npm run check
npm run test:worker
python scripts/verify_schema.py
```

The GitHub Actions workflow runs the type-check/build, Worker behavior tests and migration/schema smoke checks. Production D1 schema and foreign-key integrity have also been read back directly. A successful deployment/build is not a substitute for browser-based end-to-end tests on real devices.

## Next production gates

1. Add verified products, variants, inventory, real vehicle fleet and approved prices.
2. Upload the official logo/favicon and configure the real social profile URLs.
3. Confirm delivery, returns, privacy/retention and rental policies.
4. Connect a custom domain and onboard its email-sending domain; then configure and test transactional notifications.
5. Complete Safepay sandbox onboarding and end-to-end test transactions before considering live payment onboarding. Configure secrets only in Cloudflare Pages, never in source code or chat.
6. Complete browser/mobile end-to-end tests for product media, checkout, stock reservation, wholesale approval, staff invitations and rental CNIC access.
7. Finish customer email verification/password recovery, transactional notifications, returns/refunds workflows, order/rental operations and visual CMS. Reviews remain disabled until moderation rules are agreed.

Paid services or external account connections must not be enabled without the owner's explicit approval.

## November 2026 security and policy updates

- Cloudflare Turnstile is configured for the production Pages hostname. The storefront renders Turnstile on enquiries, COD checkout, rental requests and CNIC upload. The backend verifies every token through a dedicated Cloudflare Worker using a secret stored as a Worker secret; the secret is not present in the repository or browser code.
- The storefront now includes English and Urdu customer policies covering orders and payment, delivery, returns and complaints, wholesale quotations, vehicle rentals, privacy and CNIC handling.
- The owner can enable or disable rental CNIC uploads in Admin → Website & brand settings. Uploads remain disabled by default. When enabled, the system uses one-time upload tokens, private R2 storage and role-restricted document access. Owners/managers can delete documents manually.
- A separate Cloudflare scheduled Worker is configured to run daily at 03:00 UTC. It clears expired upload tokens and deletes CNIC files 30 days after a rental request is marked completed or cancelled, with an audit record. The first scheduled execution and its cleanup behavior still need runtime verification; keep uploads disabled until that check is observed.
- The browser tests simulate the Turnstile widget and mock the business APIs. They verify form integration and token submission, not the real Cloudflare challenge or a real customer transaction.

## Still not connected

Customer registration/sign-in, account profile, password change, order/rental history and order-status timeline are now available at /account. Email verification and email-based password recovery are not active. Safepay sandbox adapter code is present but disabled until sandbox credentials are configured and a real sandbox test is completed. Live payments, refunds, transactional email, SMS and WhatsApp automation remain unavailable and must not be advertised as active. Social account management remains a separate project.

## Verification notes — 15 November 2026

- Production smoke run #30 passed: live Pages health and D1 connection, Turnstile verifier health and secret binding, a negative Siteverify request (invalid token rejected), CNIC retention worker health with D1 and private R2 bindings, and deployed security headers.
- The CNIC cleanup Worker source is maintained at workers/deverve-cnic-retention.js; its health endpoint is checked in production smoke. Unit coverage is in scripts/cnic-retention.test.mjs. The cron trigger is 03:00 UTC daily. Runtime deletion of a real document is intentionally not tested because production contains zero rental documents.
- The Turnstile verifier source is maintained at workers/deverve-turnstile-verify.js. The actual successful human challenge path has not been exercised in an end-to-end live browser test; automated browser tests use a mocked widget callback.
- Production D1 currently has no CNIC upload setting row (so the application default is disabled) and zero rental documents. No customer orders, products, variants or vehicles were created as test data.
- A clear 7-calendar-day return request window and 7-working-day approved refund processing target are now disclosed in both languages. Owner/legal review is still recommended before accepting paid orders.


## Customer accounts and order tracking — 15 November 2026

- Migration 0012 is applied in production D1; the export was created before applying it. The migration adds customer/session/token tables, order status events, payment attempts/webhook records and notification outbox tables.
- The deployed `/account` page supports registration, sign-in, profile updates, password changes, customer-only order history and rental request history.
- Customer sessions are 256-bit random tokens stored as SHA-256 digests, carried only in a host-only HttpOnly/Secure/SameSite=Strict cookie, with a 30-day expiry.
- Customer passwords use the existing PBKDF2-HMAC-SHA-256 password helper. Rate limits and Turnstile protect public registration; sign-in has D1-backed per-IP rate limiting.
- New checkout orders and rental requests are associated with the signed-in customer. Historical guest orders are never automatically linked by matching an unverified email.
- Order creation and admin status transitions create immutable status-event records; the customer account displays the event timeline.
- Email verification and password-reset email flows are not enabled because no transactional email provider is configured. Customers can change a password only while signed in.
- CI run #43704058411 passed 27 Worker/CNIC tests, schema validation and four desktop/mobile storefront browser tests. Production smoke run #43704125125 passed.
