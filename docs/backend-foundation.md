# De VERVE backend foundation — production snapshot

Last verified: 15 November 2026. This document supersedes the original pre-deployment setup notes that follow in older project history.

## Production architecture

- Storefront: React + TypeScript + Vite, deployed on Cloudflare Pages.
- API: Pages Functions / Worker at the same origin under `/api/*`.
- Database: Cloudflare D1, database ID `355da876-17c4-4762-a59d-bb85f2e4551b`.
- Media: private Cloudflare R2 with Worker authorization for public product, vehicle and brand assets.
- Source of truth: GitHub repository `Nabeelwasti/Deverve-Official`, `main` branch.
- Production URL: https://deverve-official.pages.dev/

## Database state

All 12 additive SQL migrations are represented in `migrations/`. The schema verifier checks 36 required application tables and core constraints. Migration 0012 adds:

- `customers`, `customer_sessions`, `customer_account_tokens`
- `order_status_events`
- `payment_attempts`, `payment_webhook_events`
- `notification_outbox`, `notification_attempts`
- nullable customer links on orders and rental requests

Migration 0012 was applied directly to production D1 after a database export. Read-back confirmed the eight new tables. The existing owner account and three media assets were preserved. Products, vehicles, customers, orders and rental requests remain empty. Never run an additive migration twice; compare the live schema first.

Money values are integer paisa. Do not insert fabricated products, stock, prices, vehicles, orders, reviews or customers.

## Customer account API

- `POST /api/customer/register`: Turnstile-protected account registration; 12–128 character password; returns a secure customer session.
- `POST /api/customer/login`: email/password sign-in with D1-backed rate limiting.
- `GET /api/customer/me`: current authenticated customer profile.
- `POST /api/customer/logout`: revokes the current session.
- `PATCH /api/customer/profile`: updates the signed-in customer's name and phone.
- `PATCH /api/customer/password`: requires the current password; updates the password and revokes other sessions.
- `GET /api/customer/orders`: returns only orders linked to the authenticated customer, including items and status events.
- `GET /api/customer/rentals`: returns only rental requests linked to the authenticated customer.

Customer session tokens are 256-bit random values; only SHA-256 digests are stored. Cookies are host-only `__Host-`, HttpOnly, Secure, SameSite=Strict, scoped to `/`, and expire after 30 days. Public registration requires Turnstile and is rate-limited. New checkout/rental requests made while signed in are linked to the account. Historical guest records are not linked by unverified email matching.

Email verification and email-based password recovery are not active because no transactional email sender is configured. The customer page tells users this clearly. Customers can change their password while signed in.

## Order tracking

Order creation writes a system status event. Admin status transitions write an admin event and an audit log. The account page displays the status-event timeline. Customer history queries are constrained by the authenticated customer ID; no caller-supplied customer/order ID grants access.

## Still not connected

- Safepay Express Checkout sandbox adapter is implemented in the Worker, including tracker creation, passport token, hosted checkout URL, HMAC-SHA512 webhook verification, duplicate-event protection and amount/currency/order reconciliation. The adapter is strictly sandbox-only and requires `SAFEPAY_ENV=sandbox`, `SAFEPAY_MERCHANT_API_KEY`, `SAFEPAY_SECRET_KEY` and `SAFEPAY_WEBHOOK_SECRET` as Cloudflare Pages secrets. None are currently configured, so COD remains the only available payment option. No real sandbox transaction has been completed. Live payment onboarding, live keys, refund support and end-to-end reconciliation remain open.
- Transactional email: no sending domain/provider is configured. Email verification, password reset and notification delivery remain disabled.
- SMS and WhatsApp Business Platform: no approved provider/account/templates are connected.
- Returns/refunds automation and a complete customer support workflow remain outstanding.
- Social-account management is a separate project.
- Products, vehicles, variants, inventory, fleet and prices are intentionally empty until the owner supplies verified business data.

## Verification

- CI run #43704058411 passed: build/type-check, security-header artifact check, 27 Worker/CNIC tests, 12-migration / 36-table schema check and four desktop/mobile Playwright tests.
- Production smoke #43704125125 passed: Pages health, D1 connectivity, Turnstile verifier/Siteverify negative test, CNIC retention Worker bindings and deployed security headers.
- Customer account UI: `/account`.
- Admin UI: `/admin`.

This is a tested production deployment with a limited set of live commerce features, not a certification for unrestricted online commerce. Merchant/payment onboarding, notification providers, business policy sign-off, owner-supplied catalogue/fleet data and real-device acceptance remain required.


## Safepay sandbox integration

- `GET /api/storefront/payment-options` returns whether the sandbox option is available. It remains false until the three Safepay secrets and explicit sandbox environment flag exist.
- A customer must be signed in and the delivery fee must be approved before the payment session endpoint will create a tracker.
- The tracker amount is taken from the server-side order total in integer paisa. The client cannot supply or override the amount.
- Webhook signature is verified over the exact raw body using HMAC-SHA512. The stable event token is used for idempotency. Successful payments require the final tracker state, PKR currency and exact amount match before updating the order.
- Admin order processing and dispatch are blocked for Safepay orders until the payment status is paid.
- Sandbox and production credentials are separate. This code intentionally refuses to run unless `SAFEPAY_ENV=sandbox`; no live host or live mode is present.
- CI run #43705027659 passed the type-check/build, 29 Worker tests, 12-migration / 36-table schema validation and four Playwright storefront tests. Production smoke run #43705100039 passed live health/D1, Turnstile, CNIC-retention binding and security-header checks.
- The latest Pages deployment was successful for commit `1a5e517c722fe24a99e5fdca9792244f6904c5d1`. Payment secrets are not configured, so the public checkout continues to offer COD only.
