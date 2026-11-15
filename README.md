# De VERVE — Commerce & Business Operations Platform

Mobile-first fashion, wholesale and vehicle-rental storefront with a role-based business operations workspace for De VERVE, Jhelum, Pakistan.

## Live environment

- Storefront: https://deverve-official.pages.dev/
- Admin: https://deverve-official.pages.dev/admin
- Customer account: https://deverve-official.pages.dev/account
- Source: https://github.com/Nabeelwasti/Deverve-Official
- Hosting: Cloudflare Pages
- API: Cloudflare Pages Functions / Worker handler
- Database: Cloudflare D1 (`deverve-production`, APAC)
- Media: private Cloudflare R2 bucket; public media is delivered through the Worker authorization route.

## Implemented capabilities

### Storefront and commerce
- Responsive mobile-first storefront with fashion, wholesale, car-rental, contact and policy areas.
- Product catalogue, search/filtering, product details, image/video galleries and favourites.
- Browser-persisted cart and server-validated Cash on Delivery checkout.
- Server-side price and stock validation, stock reservations and duplicate-submission protection.
- Delivery fee quotation with a 48-hour customer approval/decline link before fulfilment.
- Wholesale enquiries, staff quotations, customer approval links and conversion to stock-reserved COD orders.
- Vehicle catalogue and rental request flow with pickup/destination addresses and overlap checks for confirmed bookings.
- WhatsApp contact and contextual follow-up links.
- Installable PWA shell; customer and API data are excluded from offline caching.

### Customer accounts and service
- Customer registration/sign-in, profile and password changes.
- Customer-scoped order and rental history.
- Order status timeline.
- Customer return requests for eligible delivered orders within seven calendar days.
- Return status history; refund completion is recorded only after staff enter the actual manual refund method and transaction reference.

### Admin and business operations
- Owner bootstrap/login, hashed server-side sessions, login throttling, logout and audit history.
- Role-based staff invitations, access changes and account disabling.
- Product create/edit/publish/archive, variants, inventory movements and stock history.
- Media library, multiple product images/videos, product cover selection and vehicle photos.
- COD order management, wholesale quotations, fleet and rental request management.
- Customer directory/CRM, customer enquiries and unified operational follow-up inbox.
- Returns and manual refund records.
- Owner-managed logo/favicon, social profile URLs and CNIC-upload setting.
- Owner-only business activity history.

### Security and infrastructure
- Cloudflare D1 relational database and private R2 object storage.
- Server-side authorization and role checks for protected admin/customer routes.
- Hashed random session tokens in HttpOnly, Secure, SameSite=Strict host-only cookies.
- Same-origin checks for mutations.
- Cloudflare Turnstile with server-side verification for protected public forms.
- D1-backed public rate limits.
- Security response headers and Content Security Policy.
- Separate scheduled CNIC retention Worker; CNIC uploads remain disabled by default.
- GitHub Actions build, type-check, Worker tests, schema checks, desktop/mobile browser tests and post-deployment smoke checks.

## Current production snapshot

Read-only checks against the production D1 database on 15 November 2026 found:

| Record type | Count |
|---|---:|
| Owner/admin accounts | 1 |
| Media assets | 3 |
| Customer accounts | 0 |
| Products / published products | 0 / 0 |
| Product variants | 0 |
| Vehicles | 0 |
| Orders | 0 |
| Rental requests | 0 |
| Return requests | 0 |
| CMS pages / sections / navigation items | 0 / 0 / 0 |
| Sales-channel connections / listings | 0 / 0 |

The site is deployed and its health/database connectivity, Turnstile verifier, scheduled-retention bindings and security headers have passed the latest automated production smoke checks. A green deployment does not mean the business is ready to accept real orders: the live catalogue and fleet have not yet been entered.

## Important operating limits — do not advertise unavailable features

- **Payments:** COD is the only active checkout method. A Safepay sandbox adapter and signed webhook reconciliation are implemented but dormant. No sandbox or live payment transaction has been completed.
- **Notifications:** transactional email, SMS and automated WhatsApp messages are not connected. Enquiries and orders are stored in the admin database; staff can contact customers using the displayed contact details and WhatsApp links.
- **Social accounts:** the website stores public social profile URLs only. OAuth connections, publishing, inbox access, ad management and analytics imports are not implemented here.
- **CMS:** the database has foundational page/section/navigation/revision tables, but the admin page builder, public CMS renderer, preview/publish workflow and navigation editor are not yet implemented.
- **Sales channels:** database foundations exist, but marketplace OAuth, product feed/API adapters, stock sync and order sync are not implemented.
- **SEO:** the current product detail view is a modal, not a dedicated indexable product URL. Per-product metadata, structured data and dynamic sitemap generation remain to be completed.
- **Returns:** the system manages requests and audited manual refund records. It does not send money, trigger Safepay refunds or automatically restock returned goods.
- **Rental identity documents:** CNIC uploads are disabled by default. Do not enable them until the owner approves the retention policy and the scheduled deletion process has been observed operating.
- **Customer email:** email verification and email-based password recovery are not active.
- **Branding and data:** the logo/favicon assets are uploaded, but final brand approval is still an owner decision. Production contains no real product or fleet records. Never invent products, prices, stock, vehicle availability, reviews or brand-authenticity claims.
- **Business policies:** delivery coverage/fees, wholesale minimums, vehicle rates, rental terms, returns, privacy/retention details and business hours require owner confirmation and legal review.
- **Domain:** the current live address is the Cloudflare Pages hostname. A custom domain is not connected.

## Release gates

1. Enter verified garment products, variants, sizes, colours, actual prices, stock and genuine product photos.
2. Enter the real rental fleet, photos, availability, rates and approved rental terms.
3. Confirm the business phone/WhatsApp, email, address, opening hours, delivery coverage and charges.
4. Obtain owner approval for English/Urdu customer policies, returns, privacy and document-retention wording.
5. Complete real-device customer and admin acceptance tests for COD, stock reservation/release, wholesale quotations, returns, rental requests, staff permissions and media access.
6. Configure transactional email only after an approved sending domain/provider is available; then test verification and password recovery.
7. Complete Safepay sandbox onboarding and a verified end-to-end sandbox transaction before considering live payment onboarding. Keep all credentials in Cloudflare secrets, never in source code, GitHub issues or chat.
8. Implement the CMS/page builder, dedicated SEO-friendly product routes and structured data.
9. Add sales-channel integrations only after confirming De VERVE account eligibility and official API access for each platform.
10. Connect a custom domain after the owner confirms domain ownership and DNS access.

Paid services, live payment methods, external account connections and sensitive-document collection must not be enabled without the owner's explicit approval.

## Local development and verification

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
npm run check
npm run test:worker
python scripts/verify_schema.py
npm run test:e2e
```

The latest verified source commit is `c512448c68dde33c4ba4f0d8523b7b99b634fa06` (15 November 2026).

- Build/type-check and CI run #331: https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43717007816
- Production smoke run #71: https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43717113043

A feature is complete only when its UI, API, database behavior, permissions, failure states, audit trail, automated tests and operator instructions are implemented and verified. Report implemented, tested, deployed and live separately.


## Development update — 15 November 2026

### Newly implemented in the current development phase

- Owner/manager visual CMS workspace: create/edit pages, safe section blocks, reorder/hide blocks, internal navigation editing, draft/publish/archive workflow, page revision snapshots and audit entries.
- Public CMS page renderer at `/pages/:slug`; only published pages are returned by the public API. Section content is plain text and a constrained internal media/button URL allowlist; arbitrary HTML, JavaScript and CSS are not accepted.
- Product SEO title/description fields, dedicated `/product/:slug` routes, canonical and Open Graph metadata, and Product JSON-LD structured data.
- Owner-only notification inbox for new orders, rental requests, enquiries and successful Safepay payments, with unread count, mark-read and mark-all-read actions.
- Resend owner email delivery queue for new orders, rental requests and successful online payments. The queue stores attempts and provider outcomes, retries temporary failures and does not block the customer-facing order/rental response.
- Safepay production environment is now supported behind a separate explicit `SAFEPAY_LIVE_ENABLED=true` gate. Sandbox remains separate. Production must not be enabled until merchant onboarding and end-to-end tests are completed.
- Footer developer credit is now styled in dark navy blue.
- The rental document upload form already provides separate required CNIC front and back image inputs, private R2 storage, Turnstile and consent. Document upload remains disabled until the owner approves retention settings.

### Email configuration (Cloudflare Pages production environment)

Set these values in Cloudflare Dashboard → Workers & Pages → De VERVE Pages project → Settings → Environment variables:

- `RESEND_API_KEY` — add as a **secret**, not a plain-text public variable.
- `RESEND_FROM_EMAIL` — sender address on a domain verified with Resend.
- `OWNER_NOTIFICATION_EMAIL` — approved business inbox for owner alerts.

After setting them, redeploy the Pages project and verify the owner panel shows **Email alerts connected**. Test with a low-risk real enquiry/order before relying on email. The in-app owner notification inbox works even when email is not configured.

### Payment environment configuration

- Existing checkout methods: Cash on Delivery and Safepay card checkout (currently sandbox unless the owner configures production).
- Safepay production requires valid production credentials, `SAFEPAY_ENV=production`, and the separate `SAFEPAY_LIVE_ENABLED=true` flag.
- Never reuse sandbox credentials in production or commit any payment secrets.
- JazzCash and Easypaisa are **not integrated or enabled** in this codebase yet. They require De VERVE merchant onboarding, provider credentials, signed return/webhook handling, reconciliation and sandbox/live acceptance tests. Do not display them as selectable payment options until those adapters are implemented and verified.
- No bank-transfer account details have been supplied/configured; do not show made-up account details or accept an unverified transfer as paid.

### Remaining release gates

1. Add automated CMS and public product SEO route tests, sitemap generation, product image/alt-text SEO controls and social preview verification.
2. Run CI after the latest changes and inspect every failing test before merging/deploying. A green type-check alone is not production acceptance.
3. Verify CMS migrations are applied to production D1 before using the page builder.
4. Configure and test Resend credentials and verify email delivery/retry records.
5. Complete Safepay sandbox payment lifecycle tests, then only enable production after provider approval and signed webhook reconciliation is observed.
6. Implement JazzCash/Easypaisa adapters only after merchant access and official integration credentials are available.
7. Confirm the owner-approved rental document retention policy and observe scheduled private-R2 deletion before enabling CNIC uploads.
8. Add real products, product variants, actual stock, product photos and rental fleet data; run real-device end-to-end acceptance.

