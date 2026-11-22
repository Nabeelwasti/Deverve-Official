# nopCommerce architecture review and DeVErve adaptation plan

**Reviewed:** 22 November 2026  
**Reference:** https://github.com/nopSolutions/nopCommerce (develop branch)  
**Decision:** Adopt compatible architecture patterns; do not merge the nopCommerce source tree or replace DeVErve's existing stack.

## What the reference project provides

The repository is a mature, layered .NET commerce platform. Its solution separates core/domain contracts, services, data access, web presentation/framework concerns, and extensibility through plugins. It supports a broad commerce surface: catalog and product attributes, customers, orders, discounts/promotions, shipping, payment methods, tax, localization, store configuration, administration, APIs, and integrations.

That breadth is useful as a capability checklist, not as a list of features to copy without a DeVErve use case.

## Licensing and source-code boundary

The reference repository's NPL 4.0 is based on AGPL v3 with additional requirements, including visible, linked "powered by nopCommerce" attribution on every user-interface screen. DeVErve should not copy or adapt nopCommerce implementation files, templates, or assets unless the owner deliberately accepts those obligations and the source-disclosure implications after legal review.

This review records architectural ideas and independent implementation requirements only. No nopCommerce source code is imported.

## What DeVErve should adopt

| Reference pattern | DeVErve adaptation | Priority |
|---|---|---|
| Clear Core / Services / Data / Web boundaries | Keep React storefront, Cloudflare Worker domain routes, D1 repositories, and R2 media behind explicit module boundaries. Avoid expanding the single worker router into an unstructured monolith. | High |
| Plugin and provider extensibility | Define provider adapters for payment, delivery, messaging, analytics, and future marketplaces. Each adapter needs capability flags, health state, timeouts, retries, and an explicit disabled state. | High |
| Fine-grained ACL | Keep role-based permissions server-enforced for every mutation. Add permission-matrix regression tests and least-privilege defaults for staff roles. | High |
| Catalog attributes and variants | Preserve size/colour/SKU/stock combinations; add reusable attribute definitions and validation only where the garment catalogue needs them. | High |
| Media and content management | Reusable media library, focal-point/crop controls, alt text, responsive renditions, and preview in the exact destination frame. | High |
| Order lifecycle | Keep explicit order/payment/fulfilment states, immutable line-item snapshots, idempotent transitions, and auditable refunds/returns. | High |
| Promotions and customer segments | Build on existing coupon/wholesale rules; add stacking, eligibility, usage caps, and expiry only with tests and owner-approved business rules. | Medium |
| Localization and currency | Pakistan-first PKR, English/Urdu authored content, and accurate server-side price formatting. Do not ship unreliable machine translation as a substitute for reviewed copy. | High |
| API-first integrations | Version public/admin API contracts, validate inputs at boundaries, and keep secrets server-side. | High |
| Multi-store and marketplace breadth | Defer until DeVErve actually operates multiple brands/stores or third-party sellers. | Low |

## Existing DeVErve capabilities to preserve

DeVErve already has a distinct retail/wholesale/rental model and existing modules for products and variants, inventory, orders, customer enquiries, wholesale quotations, coupons, returns/exchanges, POS, vehicles/rentals, CMS pages, media, staff permissions, audit history, and AI assistance. These must not be replaced by a generic commerce implementation.

## Recommended engineering sequence

1. Keep the current D1/R2 data model and introduce explicit domain service boundaries before adding more routes.
2. Add contract tests for permissions, state transitions, idempotency, and provider failure behaviour.
3. Make media editing reusable across product, vehicle, brand, CMS, and category assets; store a focal point or normalized crop per usage rather than forcing every image into one global crop.
4. Build payment and delivery providers as opt-in adapters. Do not advertise an integration until credentials, sandbox tests, webhook verification, reconciliation, and rollback are complete.
5. Add operational observability: structured request IDs, redacted logs, queue age, provider health, migration version, backup freshness, and restore verification.
6. Run end-to-end tests on desktop and physical Android devices before a production release.

## Explicit non-goals

- Do not port nopCommerce's .NET stack into this React/Cloudflare application.
- Do not copy its source code, themes, branding, or database schema.
- Do not add multi-store, tax, marketplace, or enterprise features merely to match its feature count.
- Do not remove existing DeVErve capabilities to make an imported architecture fit.

## Release gate

This document is an architecture review, not a production-release approval. Production deployment remains gated on verified recoverable backups, successful current-head CI, migration review, payment/webhook checks, and physical-device acceptance.


## Current capability comparison — 22 November 2026

This is a DeVErve-specific feature-gap assessment, not a claim of parity with nopCommerce. Status distinguishes source functionality from live provider/business acceptance.

| nopCommerce capability | DeVErve status | Decision |
|---|---|---|
| Product catalogue, attributes and combinations | **Implemented, focused** — size/colour variants, SKU/barcode, per-variant stock, galleries and category/audience data | Preserve the current garment-first model. Add a new attribute only when real catalogue data needs it; do not replace variant IDs or stock records. |
| Wishlist / saved products | **Implemented** — customer favourites | Keep existing behavior; no second wishlist system. |
| Product reviews | **Implemented in source** — verified-purchase review workflow and moderation | Preserve verification and moderation; never fabricate ratings or testimonials. |
| Discounts, coupons and promotions | **Implemented in source** — order promotions, hashed coupon codes, eligibility, limits, redemption and reversal audit | Keep one-promotion-per-order rules unless the owner approves and tests stacking. |
| Customers and order history | **Implemented** — customer accounts, scoped orders/rentals and status timeline | Preserve customer isolation and server-side authorization. |
| Returns / refunds | **Deliberately limited** — new customer exchange workflow; historic refund records retained for administration | Do not enable generic returns/refunds without an owner-approved policy and verified payment/refund integration. |
| Wholesale / B2B | **Implemented** — enquiries, quotations and customer approval | Keep the bespoke RFQ/quotation flow; it is more relevant than generic multi-vendor marketplace support. |
| POS and inventory operations | **Implemented in source** — stock movements, reservations, barcode/QR lookup and POS workflows | Preserve atomic stock movement and physical reconciliation gates. |
| Vehicle rental | **DeVErve-specific implementation** | Keep separate from garment commerce; no nopCommerce import is suitable. |
| CMS and media | **Partially implemented** — CMS pages, media library, upload crop/placement presets | Existing uploads can be cropped during upload/replacement; opening an already-saved asset for in-place recropping/repositioning remains a gap. Prioritize reusable per-placement focal points and previews. |
| Staff roles / ACL | **Implemented in source** — role-based admin access and server-side permission checks | Continue permission-matrix tests and least-privilege defaults. |
| Payment providers | **Partially implemented / not accepted** — COD is active; direct-transfer details and payment links can be configured; Safepay is not yet accepted | Use opt-in provider adapters with webhook verification, idempotency, reconciliation and a safe disabled state. Do not advertise an unverified integration. |
| Shipping providers | **Not fully integrated** — delivery fee approval and handoff workflows exist | Add courier adapters only after account eligibility, API access, tracking, failure handling and reconciliation are tested. |
| Tax engine | **Not implemented** | Defer until a Pakistan-qualified tax/accounting adviser supplies approved rules. Never invent tax rates. |
| Multi-currency | **Not implemented** — PKR-first | Defer international pricing until exchange-rate, rounding, tax and settlement rules are approved. |
| Multi-store / multi-vendor | **Not implemented** | Deliberately defer: DeVErve currently operates one brand and its own stock. |
| Gift cards / store credit | **Not implemented** — coupons and case-specific compensation exist | Defer; do not treat a coupon as stored-value credit. |
| Product comparison | **Not implemented** | Low priority for the current fashion catalogue; favourites and size/colour selection already cover the more immediate need. |
| Localization | **Authored English/Urdu content**; unreliable customer-facing machine-translation control is not part of the storefront | Keep reviewed bilingual content. Do not add a translator merely for feature parity. |
| Plugin ecosystem / external API | **Partial** — isolated Worker routes and provider-specific integrations exist; no generic nopCommerce-style plugin runtime | Adopt small, typed provider adapters, not executable third-party plugins. Keep secrets server-side and each provider disabled until accepted. |

### Safe integration decisions

1. **Already adopted or present:** server-enforced ACL, customer/order isolation, product variants, coupons/promotions, audit history, order state controls, CMS/media workflows, and provider-specific integration boundaries. These remain DeVErve-native implementations.
2. **Next worthwhile engineering improvements:** reusable in-place media editing with per-placement focal points; stronger provider-adapter contracts and health reporting; API contract/version tests; operational telemetry and independent recovery evidence. These are additive improvements and must not change existing customer/order/inventory semantics.
3. **Deferred by design:** tax automation, multi-currency, multi-store, multi-vendor, gift cards, generic product comparison, and marketplace sync. They add complexity without a verified current business requirement.
4. **No source-code import:** nopCommerce's NPL 4.0 adds a visible linked attribution requirement on every UI screen and is based on AGPL v3. The current DeVErve application remains on its React/TypeScript/Cloudflare/D1 architecture. This assessment uses public feature and architecture descriptions only; it does not copy nopCommerce source, assets, schemas or templates.

Operational status is separate from source status. A feature is not considered production-accepted until its real provider, data, permission and business workflow has passed its own tests.
