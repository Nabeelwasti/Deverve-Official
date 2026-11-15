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

- Checkout currently supports **Cash on Delivery only**. No payment gateway is connected. Online payments must wait for an approved merchant account, provider credentials, webhook configuration and reconciliation tests.
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
- Admin sessions are hashed, HttpOnly, Secure and SameSite=Strict.
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
5. Choose a Pakistan-supported payment provider and supply merchant credentials before enabling online payment.
6. Complete browser/mobile end-to-end tests for product media, checkout, stock reservation, wholesale approval, staff invitations and rental CNIC access.
7. Add customer accounts/order tracking, reviews and the visual CMS only after their access and moderation rules are agreed.

Paid services or external account connections must not be enabled without the owner's explicit approval.
