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
| Medium | Customer lifecycle | Customer accounts, public order tracking, returns/refunds, transactional email/SMS, and payment gateway are not implemented. | Treat these as roadmap items; do not advertise them as available. |
| Medium | Domain and SEO | The site uses the shared Pages hostname. Product detail views are not dedicated indexable product URLs. | Connect the business domain and later add canonical product routes, structured data, and per-product metadata. |

## Explicit operating boundaries

- Cash on Delivery is the only checkout method. No online payment provider is connected.
- Social profile URLs are display links only. OAuth, publishing, inbox management, ads, and social analytics are not implemented.
- No email sending domain or transactional notification provider is configured.
- No products, vehicles, reviews, or business claims should be fabricated to make the storefront look populated.
- The new CSP must be checked on the deployed site, including PWA installation, Google Fonts, media previews, admin forms, and future third-party integrations.
- HSTS intentionally omits includeSubDomains because the current host is pages.dev, a shared domain.

## Verification required after deployment

1. GitHub Actions: build/type checks, all 21 Worker tests, 11-migration / 28-table schema checks, and four desktop/mobile Playwright storefront tests pass on the release commit.
2. Cloudflare Pages deployment for that exact commit reports success.
3. Live /api/health returns a healthy database response.
4. Live response headers include the intended CSP and security headers without breaking assets or application behavior.
5. Test a rental booking with a Pakistan-local future time and confirm the stored UTC timestamp is correct; test past, invalid, and overlapping bookings against an isolated D1 environment.
6. Complete real-device journeys for retail COD, stock reservation/release, wholesale approval, admin roles, media access, and rental document controls.
7. Close every owner/business dependency above before claiming unrestricted launch readiness.

Verdict: The code can be deployed and technically smoke-tested, but a 100% production-ready certification is not defensible while the listed security, data, policy, and real-world acceptance gates remain open.
