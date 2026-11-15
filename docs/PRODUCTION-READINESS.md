# De VERVE production-readiness report

Audit baseline: 9e5ac6bfbc45e455d770405b016c17b395538a3a

Status: technically improved; not certified for unrestricted production commerce.

## Changes in this release

- Rental datetime-local values are parsed explicitly as Pakistan Standard Time (UTC+05:00), validated as real calendar dates, and stored as UTC ISO timestamps. Explicitly zoned ISO timestamps remain supported.
- Regression tests cover Pakistan UTC+05:00 conversion, seconds, explicitly zoned input, impossible dates, and malformed timezone-less input.
- Cloudflare Pages security headers are defined in _headers, including CSP, frame restrictions, MIME sniffing protection, referrer policy, permissions policy, and HSTS suitable for the shared pages.dev host.
- A minimal robots policy and canonical sitemap are included for the current production hostname.
- Atomic D1-backed fixed-window limits protect public enquiries, COD checkout, rental requests and CNIC uploads. Only a SHA-256 digest of the Cloudflare client IP plus endpoint scope is stored; raw IP addresses are not persisted. Limits fail closed if the rate-limit store is unavailable. Local development without the Cloudflare edge IP header skips the limiter.
- README security and launch-gate statements are updated.

## Remaining release blockers

| Priority | Finding | Why this prevents an unconditional certification | Required closure |
|---|---|---|---|
| High | Public form/API abuse controls | Atomic D1 fixed-window limits now protect enquiries (8/15 min), checkout (5/15 min), rental requests (5/15 min), and CNIC uploads (3/15 min) per Cloudflare client IP. This reduces single-source abuse but does not stop distributed botnets or replace a challenge. | Configure and verify server-side Turnstile (site and secret keys), add periodic expiry cleanup for stale buckets, and test distributed traffic. |
| High | CNIC retention and deletion policy | Identity documents are sensitive personal data. A business-approved retention period and automated expiry are absent. | Owner approves retention period, customer notice/consent text, access policy, and purge schedule before accepting documents. |
| High | Delivery fee finalization | Checkout records delivery fee as zero while the UI says the fee will be confirmed. The admin workflow does not obtain customer acceptance of a revised total. | Implement a quoted delivery-fee state and customer acceptance/rejection flow before dispatch. |
| High | Real catalogue and fleet data | Production database currently has no published products/variants/stock or available vehicles. | Enter verified products, prices, sizes, colours, stock, vehicle data, rates, and real photos. |
| High | Business identity and legal content | Official logo, verified contact details, returns/exchange terms, delivery coverage, wholesale terms, rental terms, business hours, and privacy notice require owner confirmation. | Confirm and publish accurate business information and policies. |
| Medium | End-to-end verification | Existing Worker tests use a fake D1 implementation. Browser-level checkout, staff invitation, media, wholesale, rental, and CNIC workflows have not all been verified against production-like Cloudflare D1/R2. | Add isolated integration/E2E tests and complete mobile browser checks. |
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

1. GitHub Actions: build/type checks, Worker tests, and migration/schema checks pass on the release commit.
2. Cloudflare Pages deployment for that exact commit reports success.
3. Live /api/health returns a healthy database response.
4. Live response headers include the intended CSP and security headers without breaking assets or application behavior.
5. Test a rental booking with a Pakistan-local future time and confirm the stored UTC timestamp is correct; test past, invalid, and overlapping bookings.
6. Complete real-device journeys for retail COD, stock reservation/release, wholesale approval, admin roles, media access, and rental document controls.
7. Close every owner/business dependency above before claiming unrestricted launch readiness.

Verdict: The code can be deployed and technically smoke-tested, but a 100% production-ready certification is not defensible while the listed security, data, policy, and real-world acceptance gates remain open.
