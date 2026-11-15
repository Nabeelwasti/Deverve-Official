# De VERVE — Commerce & Business Operations Platform

Mobile-first fashion, wholesale and vehicle-rental storefront with a role-based business operations workspace for De VERVE, Jhelum, Pakistan.

## Live environment

- Storefront: https://deverve-official.pages.dev/
- Admin: https://deverve-official.pages.dev/admin
- Customer account: https://deverve-official.pages.dev/account
- Source: https://github.com/Nabeelwasti/Deverve-Official
- Production branch: `main` only
- Hosting: Cloudflare Pages (`deverve-official`)
- Database: Cloudflare D1 (`deverve-production`, APAC)
- Media: private Cloudflare R2 (`deverve-media-private`)

## Implemented

### Storefront and commerce
- Responsive fashion, wholesale, car-rental, contact and bilingual policy pages.
- Product catalogue with search/filtering, dedicated `/product/:slug` routes, galleries, favourites and cart.
- Server-side price/stock validation, stock reservations and duplicate checkout protection.
- Cash-on-delivery checkout with delivery-fee quotation and a 48-hour customer approval/decline flow.
- One server-selected promotion per order:
  - Above Rs. 5,000: free delivery, only when no percentage offer applies.
  - Above Rs. 20,000: 30% discount.
  - Full advance payment: 40% discount, unless the 45% offer applies.
  - Above Rs. 40,000: 45% discount.
- Wholesale enquiries, staff quotations, customer approval links and conversion to stock-reserved COD orders.
- Vehicle catalogue and rental request flow with Pakistan-time validation and overlap checks for confirmed bookings.
- Contextual WhatsApp contact links and installable PWA shell.

### Customer accounts and service
- Customer registration/sign-in, profile and password changes.
- Customer-scoped order and rental history and order-status timeline.
- Exchange-only customer policy with a dedicated in-site workflow: eligible delivered orders can submit item-level requests within seven days of the actual delivery event; customers can track status and authorised staff can review, approve/reject, record receipt and complete cases. Replacement stock is still confirmed by staff before fulfilment.
- New customer return submissions are rejected. Historic return/refund records remain for legacy administration only.

### Admin and business operations
- Owner bootstrap/login, hashed server-side sessions, login throttling, audit history and role-based staff invitations.
- Owner-only staff creation and permission changes; managers cannot grant themselves owner privileges.
- Product, variant, stock, inventory movement, media and vehicle management.
- Orders, delivery quotations, wholesale, rental requests, customer CRM, enquiries and follow-up inbox.
- Block-based CMS workspace for pages, sections, navigation, draft/publish/archive, revision snapshots and audit events.
- Product SEO title/description, canonical and Open Graph metadata, Product JSON-LD, dedicated product routes and dynamic sitemap.
- Owner-only in-app notification inbox and owner-managed primary/secondary email recipient settings.
- Resend notification outbox with retry/audit records; actual email delivery remains disabled until provider credentials and a verified sender are configured.
- Owner-managed brand assets and social profile URLs.

### Security and infrastructure
- Cloudflare Pages Functions, D1 and private R2.
- Server-side role checks, hashed random session tokens, HttpOnly/Secure/SameSite=Strict cookies and same-origin mutation checks.
- Cloudflare Turnstile verification through a separate Worker and D1-backed public rate limits.
- Security response headers and Content Security Policy.
- Separate scheduled CNIC-retention Worker with D1/R2 bindings. CNIC uploads remain disabled until the owner approves the retention policy.
- GitHub Actions build, type-check, Worker tests, schema checks and desktop/mobile browser tests.

## Production snapshot — 15 November 2026

The payments, promotions, owner-notification and exchange-policy change set was merged into `main` as `4feb999f0332a6ef5234bb9a6faf985c94268b78`. The exchange case-management workflow was then added directly on `main`. Main commit `ec367c3c9caa19bf19ce68ff7d9d990f10c771c1` passed CI run #428 and production smoke run #141. The subsequent exchange delivery-window fix, regression test, smoke-workflow update and readiness documentation are all on `main`. Latest main CI run #434 (`43736877794`) passed all 13 steps, and production smoke run #147 (`43736962128`) passed all eight steps, including health/D1 connectivity, exchange-route authentication, CMS/sitemap, Turnstile, CNIC service bindings and deployed security headers. Cloudflare Pages deployment for commit `22758a9323e8ab62554c28ae304a91d094239505` is successful.

The production D1 schema includes the four promotion columns from migration `0017_single_promotion_per_order.sql` and the three exchange case tables from migration `0018_exchange_case_management.sql`. The exchange tables were confirmed present by direct SQLite metadata queries. The database has no migration-tracking table, so production schema verification is performed by querying `sqlite_master` and table columns. No customer, order, product or rental records were created by these schema changes.

Current read-only production counts:
| Record type | Count |
|---|---:|
| Active owner accounts | 1 |
| Media assets | 3 |
| Products / variants | 0 / 0 |
| Vehicles | 0 |
| Customers / orders | 0 / 0 |
| Rental requests | 0 |
| Owner notifications | 0 |
| Exchange requests | 0 |
| CMS pages | 0 |

The direct SQLite catalogue query reports 45 tables. Cloudflare's D1 metadata `num_tables` field has previously returned 0 despite the tables being present; use direct SQL schema queries for verification.

## What is actually active

- **Checkout:** Cash on Delivery only. Safepay adapter code supports sandbox and a separately gated production environment, but the Pages project has no Safepay merchant credentials configured and no end-to-end payment has been completed. The online option therefore remains unavailable.
- **PayFast:** Not integrated. The public Premier PayFast developer API documentation describes direct card/account/wallet transaction APIs that require sensitive instrument fields; it does not provide the merchant-specific hosted OneCheckout redirect contract needed for a safe redirect-only integration. Do not collect card numbers or CVV on De VERVE pages. Obtain PayFast's hosted checkout integration specification from the merchant onboarding team before implementation.
- **Other wallets:** JazzCash and Easypaisa are not directly integrated. They may be available through an approved gateway account, but merchant eligibility and enabled methods must be confirmed.
- **Email:** In-app owner notifications work. Resend delivery is not active because no Resend API key or verified sender address is configured in the Pages production environment. The owner recipient defaults to `deverve61@gmail.com` and can be managed in the owner settings.
- **WhatsApp/SMS:** Customer contact links open WhatsApp; automated WhatsApp Business or SMS delivery is not connected.
- **Social accounts:** Only public profile URLs are stored. OAuth, publishing, inbox management, ad management and analytics imports are not part of this website.
- **Domain:** The production site currently uses the Cloudflare Pages hostname. No custom domain is connected.
- **Customer email lifecycle:** Email verification and email-based password recovery are not active.
- **CNIC:** Uploads remain disabled. Do not enable them until the owner approves the retention period, customer notice, access policy and purge schedule, and the deletion workflow is verified.
- **Business data:** There are no live product or fleet records. Never invent product names, prices, stock, vehicle availability, reviews or brand-authenticity claims.

## Remaining release blockers

1. Enter verified products, sizes, colours, variants, actual retail/wholesale prices, physical stock and genuine photos.
2. Enter the actual rental fleet, rates, availability, photos and owner-approved rental terms.
3. Confirm business phone/WhatsApp, address, email, opening hours, delivery coverage/fees and wholesale minimums.
4. Obtain owner approval for customer policies, privacy notice, exchange terms, rental terms and CNIC retention policy.
5. Configure Safepay sandbox merchant credentials in Cloudflare secrets and complete an end-to-end sandbox payment plus webhook/reconciliation tests before considering live onboarding.
6. Obtain PayFast merchant-specific hosted OneCheckout documentation and credentials before building or enabling that provider.
7. Configure a verified sending domain, Resend API key and sender address; test delivery and retry records.
8. Implement and test the dedicated exchange case-management workflow if the business wants exchanges handled inside the customer/admin portal rather than WhatsApp.
9. Complete real-device customer/admin acceptance tests against production D1/R2. Current Playwright tests mock public API responses and do not replace live order, payment, media or staff acceptance.
10. Connect a custom domain only after the owner supplies a domain they control and DNS access.

Paid services, live payment methods, external account connections and sensitive-document collection must not be enabled without owner approval. Do not call the site unrestricted-commerce-ready until the blockers above are closed.

## Local development and verification

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run check
npm run test:worker
python scripts/verify_schema.py
npm run test:e2e
```

Work directly on `main`. Do not create or switch to feature branches, force-push, reset, or discard existing work. Keep secrets and private customer/business data out of GitHub and chat. Treat implemented, tested, deployed and live as separate states.
