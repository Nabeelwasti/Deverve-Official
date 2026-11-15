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
