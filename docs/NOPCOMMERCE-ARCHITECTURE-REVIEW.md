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
