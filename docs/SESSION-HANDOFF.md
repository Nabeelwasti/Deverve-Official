## Resumed-session handoff — 16 November 2026 (Asia/Karachi)

Latest verified source commit on `main`: `925d729be765af907a150290a2b739520e364bf9`.

### Work completed in this resumed session
- `ddbb6e8`: Hardened the Turnstile widget so the frontend waits for the actual challenge iframe to mount; a stalled render now produces an actionable error and retry.
- `e619ba2`: Added browser coverage for blocked/stalled Turnstile and rental-settings failures.
- `b429038`: Made notification assertions resilient to native browser validation order and explicitly tested visible failure toasts.
- `dee739b`: Fixed rental datetime handling. The UI now formats and estimates in Asia/Karachi time and submits timezone-less wall-clock values for the Worker’s Pakistan-time parser.
- `2b244a5`: Added cross-timezone regression coverage using an America/New_York browser context.
- `5832559`: Added customer-facing vehicle gallery auto-advance and manual-navigation regression coverage.
- `925d729`: Added regression coverage that selecting a colour displays only matching product photos; CI #590 and production smoke #302 passed.
- Latest CI run #590 passed all 13 steps. Production smoke run #302 passed all eight checks. Cloudflare Pages deployment for the latest source commit succeeded.
- Do not interpret the mocked Turnstile browser test as proof that a real human challenge was completed. Production smoke confirms verifier/Siteverify connectivity; a real-device visual challenge check remains necessary.

### Production state — read-only verification
- Pages project: `deverve-official`, connected to GitHub `Nabeelwasti/Deverve-Official`, production branch `main`.
- D1: `deverve-production`, ID `355da876-17c4-4762-a59d-bb85f2e4551b`; private R2 bucket: `deverve-media-private`.
- Direct `sqlite_master` query: 55 application tables. D1 metadata `num_tables` may incorrectly report 0.
- Current counts: 1 active owner, 7 media assets, 1 product, 1 variant, 1 vehicle, 1 rental request, 1 owner notification; 0 customers, orders, exchange requests, CMS pages and POS sales.
- Production `cnic_uploads_enabled` is `true`. Do not toggle or change retention settings casually. Both sides and consent are mandatory. Retention Worker is bound to D1/private R2 and scheduled; policy is 30 days after completed/cancelled requests and 90 days for unresolved requests. Health/bindings passed smoke; a real-document purge was not tested.
- This session performed read-only D1 queries only. No production business records or customer documents were created, updated or deleted.

### Next work and release gates
1. Keep working directly on `main` only. No feature branches, force-push, reset, or destructive migrations.
2. Continue code-completable hardening and test real customer/admin flows without inserting synthetic production records.
3. Owner must complete verified catalogue/fleet data, business details and policy approval.
4. Owner/provider tasks remain: bank/wallet setup and reconciliation; Safepay sandbox credentials and webhook test; PayFast merchant docs/credentials; verified Resend sender/API key; optional custom domain.
5. Confirm owner-approved CNIC privacy/retention wording and verify scheduled deletion in a controlled environment.
6. Real-device acceptance is still required for the live Turnstile challenge and complete customer/admin flows. Current Playwright tests mock the public APIs and challenge.
7. Customer email verification/password recovery and automated WhatsApp/SMS are not active; decide whether they are required before implementing provider-dependent workflows.

Never claim 100% production readiness while the owner/provider/live-device gates remain open. Preserve all existing D1/R2 records and secrets.

---

# Main-only handoff — 16 November 2026 (Asia/Karachi)

## Latest payment-management work
- All changes were made directly on `main`; no feature branch was created or used.
- Owner-only Website Settings now saves up to 12 customer-facing direct payment methods in the existing `store_settings` JSON row. Supported types: COD, bank transfer, wallet, HTTPS payment link and QR. Fields include display name, provider, account title, bank, account/wallet number, IBAN, URL, instructions and QR media asset ID.
- The public payment-options endpoint returns only enabled methods. Payment URLs must be HTTPS. QR image files are served publicly only when referenced by an active payment method.
- Checkout shows the owner-configured payment options and the account/URL/QR instructions. It repeats instructions after order submission and tells customers to wait for final delivery-fee confirmation and use the order number as the transfer reference.
- The selected payment-method ID is stored on the order. Direct transfer orders remain pending. Only the absolute owner can manually mark a direct transfer paid after independently checking the business account; COD cannot be marked paid this way. Order processing/dispatch is blocked for unpaid direct-transfer orders.
- Admin owner settings include QR image upload through the existing private media upload workflow. Owner role is enforced by the Worker; managers and staff cannot change payment settings or verify transfers.
- Safepay's existing dynamic gateway adapter remains separately controlled by Cloudflare secrets. No Safepay merchant credentials or successful sandbox payment are configured. The owner dashboard does not yet store gateway API secrets. A provider-supplied HTTPS link can be configured as a manual option.
- PayFast is not implemented as a dynamic per-order gateway. Obtain the merchant-specific hosted OneCheckout contract and credentials first. SadaPay/JazzCash/Easypaisa can be configured as manual wallet/account methods where the merchant has valid accounts.
- Worker regression tests now cover owner-only payment-method configuration, public filtering, manual transfer verification and direct-payment fulfilment gating. The direct-payment checkout test was added; its FakeD1 fixture was corrected to model the production default `payment_provider='manual'`.
- QR public-media access now checks that the QR belongs to an enabled payment method; inactive QR images remain private.

## Recent verification
- Run #451: all 10 CI steps passed.
- Run #452: all 10 CI steps passed, including owner-configurable direct method test.
- Run #453: all 10 CI steps passed, including customer post-order payment instructions.
- Run #456: all 10 CI steps passed, including owner-only manual payment verification.
- Run #460: all 10 CI steps passed, including direct payment checkout persistence and fulfilment gating.
- Run #461: build/type-check, security header check, Worker tests and D1 schema validation passed; browser tests were still running at the time of this note.
- The latest production smoke workflow before the QR-public-media allowlist change succeeded for commit `4e465358bcc6f44c31ff1515c16c09dfb76d3d7d`. The QR media allowlist change and later documentation changes still need their own completed deployment smoke evidence.
- Latest code commit before this note: `df98b679083f4dd236caa93936282ca12491aa0e`; latest docs update: `5d20e85e63150d8c933d03522184a0af904fbdb1`.

## Remaining external/owner tasks
1. Owner enters actual bank/wallet accounts, account titles, account numbers/IBANs, hosted URLs and QR images under Admin → Website settings, then tests the full checkout and reconciliation flow.
2. Configure Safepay sandbox secrets and complete a real sandbox payment/webhook test before considering live credentials.
3. Obtain PayFast's merchant-specific hosted checkout documentation before implementing a dynamic integration.
4. Owner enters real catalogue and fleet data; the production database previously had zero products/variants and zero vehicles.
5. Configure Resend sender domain/API key, legal/business policies, and custom domain if desired.
6. Do not claim unrestricted live commerce readiness until real-device acceptance tests and payment/email provider verification pass.

---

# Current handoff — 15 November 2026 (Asia/Karachi)

## Binding workflow rule
- Work directly on `main` only. Do not create, switch to, or push feature branches. Do not force-push, reset, or discard repository work.
- Current source history includes payments merge `4feb999f0332a6ef5234bb9a6faf985c94268b78`, exchange workflow `51f693f52a3185e0696a04d6acb74b6f186cd4e3` / `cd93fdcd0cf8d464b0d0c88c46ede523451ebcb5`, and exchange delivery-window fix `c9c652bab6d7f7d4af5ca1beba6db6dabce7eae9` plus test `b76af8a0062f27ee7eb56312fef107c12aeeb60a`. Production smoke workflow update is `8777f4e86b7a027f95c3d812564db3a11035ef96`; README is updated in `5d295171f0b7c0ba6b7307a906be67ff5dc945dd`.
- Latest main CI run #434 (`43736877794`) passed all 13 steps, including type-check/build, security-header build verification, Worker authentication tests, D1 schema validation and browser tests. Production smoke run #147 (`43736962128`) passed all eight steps, including real-origin health/D1 connectivity, protected customer/admin exchange routes, CMS/sitemap, Turnstile, CNIC retention service and deployed security headers. Earlier runs #429–#432 also passed. Cloudflare Pages deployment for commit `22758a9323e8ab62554c28ae304a91d094239505` is successful as `c3922b13-b2c9-4096-aba6-64102ce468d4`; later README/handoff commits trigger documentation-only rebuilds.
- Production D1: `deverve-production`, ID `355da876-17c4-4762-a59d-bb85f2e4551b`; private R2 bucket: `deverve-media-private`. Pages is connected to GitHub `Nabeelwasti/Deverve-Official`, branch `main`.
- Migration `0017_single_promotion_per_order.sql` columns are present in production. Migration `0018_exchange_case_management.sql` tables `exchange_requests`, `exchange_request_items` and `exchange_status_events` are also present. Production has 45 tables; no migration-tracking table exists. Verify with direct `sqlite_master` and `PRAGMA table_info` queries. Do not rerun non-idempotent ALTER TABLE statements.
- Production counts: 1 active owner, 3 media assets, 0 products, 0 variants, 0 vehicles, 0 customers, 0 orders, 0 rental requests, 0 exchange requests, 0 CMS pages. No synthetic business/customer records have been inserted.
- Exchange workflow now exists in customer and admin apps. Eligibility is based on the latest `order_status_events.created_at` delivery event, not `orders.updated_at`. A helper regression test covers exactly seven days, expired, future and invalid timestamps. Production smoke workflow now checks unauthenticated customer/admin exchange collection routes return 401.
- Turnstile verifier Worker has its `TURNSTILE_SECRET` binding. CNIC-retention Worker has D1/R2 bindings and a daily schedule. CNIC uploads remain disabled pending owner-approved retention policy.
- Pages production environment currently exposes only `ADMIN_BOOTSTRAP_TOKEN`; Safepay and Resend credentials are not configured. COD remains the only active payment method.
- Safepay sandbox/live code exists but no merchant credentials or successful end-to-end transaction are present. PayFast is not integrated; obtain merchant-specific hosted OneCheckout documentation before implementation. Never collect PAN/CVV on De VERVE pages.
- Owner notification recipient defaults to `deverve61@gmail.com`; Resend delivery needs a verified sender domain/address and API key. The app can manage notification recipients but the provider sender is not yet active.
- External HTTP requests from this verification environment to the Pages hostname return a tool-side 403, so rely on the GitHub-hosted production smoke workflow for real-origin checks; do not interpret that tool-side 403 as the site's response.
- The old `feat/commerce-os-foundation` branch is stale/diverged (4 commits ahead, 388 behind) and duplicates files already on main. Do not merge it. The payments branch is merged; do all future work on `main`.

## Next work
1. Keep all future repository work directly on `main` and require CI plus production smoke to pass after every code change.
2. Continue closing code-completable launch gaps without inventing provider credentials, catalogue/fleet data or owner policies.
3. Keep COD as the only enabled method until a provider sandbox payment and webhook reconciliation have passed, then enable live only after merchant approval.
4. Keep CNIC upload disabled until owner-approved retention terms and an actual deletion verification.
5. Do not claim unrestricted production readiness while products/fleet, sender verification, payment merchant onboarding, business/legal approvals and real-device acceptance are missing.

---

# De VERVE website — active session handoff

Last reconciled: 15 November 2026 (Asia/Karachi)
Repository: https://github.com/Nabeelwasti/Deverve-Official
Production: https://deverve-official.pages.dev/
Admin: https://deverve-official.pages.dev/admin
Customer account: https://deverve-official.pages.dev/account

## Preserve these decisions

- Continue the existing repository on `main`; do not recreate the project, force-push, reset, or discard existing work.
- The repository is public by the owner's choice. Never commit secrets, customer/order/payment/rental records, CNIC documents, or private business data.
- Keep the established React 19 + TypeScript + Vite frontend and Cloudflare Pages Functions/Worker + D1 + private R2 backend.
- Keep De VERVE's logo-led blue and white brand direction.
- Mobile-first; the owner/operator primarily works from Android and does not want to edit code.
- Do not invent catalogue records, prices, stock, vehicle availability, ratings, brand-authenticity claims, policies or customer records.
- Do not activate paid services, live payment methods, external account connections or sensitive-document collection without owner approval.

## Latest verified project state before this handoff

- Source baseline: `c512448c68dde33c4ba4f0d8523b7b99b634fa06`, owner-only business activity history.
- CI build/type-check run #331 passed: https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43717007816
- Production smoke run #71 passed: https://github.com/Nabeelwasti/Deverve-Official/actions/runs/43717113043
- Production smoke verified Pages health and D1 connectivity, customer/admin return-route protection, Turnstile verifier and Siteverify rejection of an invalid token, CNIC-retention D1/private-R2 bindings, and security response headers.
- README was reconciled with the actual feature set in commit `d660c1f0c046160a94e5355d84311e2715411957`. Its CI run #332 was triggered after that documentation-only commit; check its result before the next release.

## Implemented product capabilities

- Storefront catalogue, search/filtering, product detail modal, galleries, favourites, cart and COD checkout.
- Server-side price/stock validation, stock reservations, duplicate-submit protection and customer approval of final delivery charges.
- Wholesale enquiries, staff quotations, acceptance links and conversion to COD orders.
- Vehicle catalogue and rental requests, fleet administration and confirmed-booking overlap checks.
- Customer registration/sign-in, profile/password changes, customer-scoped order/rental history and order status timeline.
- Customer return requests for eligible delivered orders; admin return workflow and manual refund recording.
- Admin product/variant/inventory/media management, staff roles/invitations, orders, wholesale, fleet/rentals, enquiries, customer CRM, unified follow-up inbox, audit history and brand/social URL settings.
- WhatsApp links and English/Urdu policy content.
- Turnstile, D1 rate limits, private R2 media, hashed secure sessions, security headers and a scheduled CNIC retention Worker. CNIC upload remains disabled by default.

## Live production data snapshot (read-only D1 query, 15 Nov 2026)

- 1 admin owner; 3 media assets.
- 0 customers; 0 products; 0 published products; 0 variants; 0 vehicles; 0 orders; 0 rental requests; 0 returns.
- 0 CMS pages, page sections or navigation items.
- 0 sales-channel connections/listings; 0 notification-outbox rows.
- Production schema query enumerated 41 tables. Cloudflare's D1 metadata field `num_tables` returned 0 despite the direct SQLite catalogue query showing the tables; trust the direct schema query and recheck metadata separately if it matters.

## Known gaps — do not mark production-ready yet

1. No verified live products/variants/stock/photos or vehicle fleet/rates have been entered.
2. CMS schema exists (`site_pages`, `site_page_sections`, `site_navigation_items`, `content_revisions`) but there are no admin CRUD endpoints, page editor, public CMS renderer, navigation editor, preview/publish workflow or page records.
3. Sales-channel tables exist, but no OAuth integrations, marketplace product adapters, stock/order sync or automated publishing are implemented. Social settings only store profile URLs.
4. Product detail is a modal, not a dedicated indexable product URL; product-level SEO metadata, structured data and dynamic sitemap remain incomplete.
5. COD is the only active payment method. Safepay sandbox code is dormant; no sandbox or live transaction has been tested.
6. Email verification/password recovery and transactional email/SMS/WhatsApp notifications are not connected.
7. Returns/refunds are recorded manually; no automatic money transfer, Safepay refund or automatic restocking.
8. CNIC uploads are disabled by default; successful real human Turnstile flow and actual scheduled deletion of a real document have not been exercised.
9. No custom domain. Delivery terms, prices, wholesale minimums, rental conditions, business contact details and legal policies need owner approval.
10. Real-device customer/admin acceptance testing and backup/restore/incident readiness still need explicit verification.

## Recommended engineering sequence

### Next engineering phase: CMS and SEO foundations

- Build secure owner/manager CMS endpoints using the existing page, section, navigation and revision tables.
- Validate page slugs, page types, SEO title/description, allowed section types and section JSON size/schema. Never allow arbitrary HTML, JavaScript or CSS from the admin.
- Add audit events, revision snapshots, draft/published/archived transitions, preview and rollback with role checks and same-origin protection.
- Build a mobile-first admin content workspace for pages, sections and navigation.
- Add public rendering for published pages using trusted React section components only.
- Add dedicated product URLs and per-product metadata/structured data after route design; update sitemap and canonical URLs.
- Add unit/worker tests and Playwright coverage; run CI, deploy, then production smoke checks. Keep changes additive and verify the live DB before migrations.

### Then

- Complete transactional email using an owner-approved sending domain/provider and test email verification/password recovery.
- Add Safepay sandbox credentials only after owner merchant onboarding; test signed webhook, exact amount/currency, retries, duplicate events and refunds before any live payment.
- Consider marketplace/channel integrations one by one after checking seller eligibility and official API access.
- Complete real-device business acceptance and owner data entry before announcing launch.

## Operator actions required for a real launch

The owner must supply/approve: verified product names/descriptions/categories, photos, retail/wholesale prices, variants and physical stock; vehicle details/photos/rates/availability; business phone/WhatsApp/email/address/hours; delivery areas/charges; wholesale minimums; rental terms; returns/privacy/retention policy; and domain/DNS access if a custom domain is desired.

## Continuation rule

Before changing code, inspect current `main`, latest commit and CI state. Make one coherent scoped change, preserve the working tree/repository, run the relevant tests, inspect CI logs on failure, and only claim success after the deployment/smoke evidence confirms it. Do not repeat full audits without a concrete trigger or changed code.


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



## Latest verified deployment — 15 November 2026

- Latest application code commit deployed: `68873fd34306e10a9c85a5aa9dd242cc021f62d6`.
- Cloudflare Pages production deployment: `b86d989e` — build and deploy stages succeeded.
- Build/type-check/Worker tests/schema/browser tests: run #43723279304 succeeded.
- Expanded production smoke checks: run #43723400580 succeeded. It verified public product catalogue response, missing/unpublished CMS page returns 404, CMS/navigation/owner-notification admin routes reject unauthenticated requests with 401, dynamic `/sitemap.xml`, Turnstile, CNIC retention bindings, database connectivity and security headers.
- Production D1 additive schema updates were applied and read back successfully: migration 0015 product SEO columns/index; migration 0016 owner notification inbox table/index. Current live D1 still has zero product, order, rental or owner-notification records.
- Dynamic sitemap includes published products and CMS pages. Product detail routes add canonical/Open Graph metadata and Product JSON-LD. Product metadata is client-rendered after hydration; server-side rendered product HTML is not implemented.
- CMS is a secure block-based editor, not yet a full freeform drag-and-drop design canvas. Dedicated data-bound gallery/video/product-grid/FAQ block renderers and media-picker UX remain future improvements.
- Resend email queue and delivery worker are deployed, but Cloudflare Pages production currently has no `RESEND_API_KEY`, `RESEND_FROM_EMAIL` or `OWNER_NOTIFICATION_EMAIL` configured. In-app owner alerts work; email delivery is inactive until these are configured.
- Safepay production support is deployed behind `SAFEPAY_LIVE_ENABLED=true`, but merchant credentials are not configured in the current Pages environment. COD is the only confirmed active checkout option. JazzCash, Easypaisa and bank transfer are not integrated/active.
- Rental form already has separate CNIC front/back upload controls, consent and Turnstile. Keep upload disabled until owner-approved retention policy and live deletion verification are complete.
- Footer developer credit for Syed Nabeel Wasti is styled in dark navy blue.

## Next actions requiring owner inputs

1. Confirm which merchant accounts De VERVE actually has (Safepay, JazzCash, Easypaisa, bank transfer) before implementing/enabling those methods.
2. Provide a verified Resend sender domain, API key and owner notification inbox through Cloudflare secrets/variables — never paste API keys into GitHub or chat.
3. Provide real product names, variants, stock, prices, media and actual vehicle/fleet data.
4. Approve business policies, rental CNIC retention duration and the precise circumstances in which staff may request CNIC documents.
5. Complete real-world end-to-end payment tests and manual bank reconciliation before enabling any live payment provider.



## Rental booking hardening — 16 November 2026

- Customer rental submission is now a single multipart request. Both CNIC sides and explicit consent are mandatory; images are validated and stored in private R2 in the same workflow as the rental record. The public flow no longer treats post-request CNIC upload as optional.
- Authorized rental staff can only confirm a rental after both CNIC document records exist. Existing admin document access and deletion permissions remain enforced.
- Vehicle records now support with_driver_daily_rate_paisa in addition to the existing self-drive daily_rate_paisa. Both self-drive and with-driver rates are required before a vehicle can be published as available; the selected mode always uses its own configured rate.
- The customer sees a live estimate based on selected vehicle, driver option and full 24-hour periods rounded up. The Worker independently recalculates and stores rental days, daily rate and total; client-submitted totals are never trusted.
- Production D1 currently has zero vehicle records. Automatic price estimates will only appear after the owner adds vehicles with rates in Admin → Vehicle fleet. With no selected vehicle, the request can still be sent and the team must quote manually.
- Migration migrations/0020_rental_pricing.sql was applied to production D1 after a successful export snapshot. PRAGMA read-back confirmed with_driver_daily_rate_paisa, rental_days, estimated_daily_rate_paisa and estimated_total_paisa. The saved CNIC uploads setting was also read back as true.
- CI must pass build/type checks, Worker tests, schema validation and browser tests. Live acceptance must confirm Turnstile, CNIC R2 writes, admin-only retrieval, confirmation gating, retention cleanup and both pricing modes.
