# DeVERVE — Digital Business Platform

A mobile-first digital platform for De VERVE, Jhelum, Pakistan.

## Product direction

One connected system for:
- Public garment catalogue and online shopping
- Retail and wholesale enquiries, tiered pricing and quotations
- Cash-on-delivery order requests and order management
- Inventory and product operations
- Car rental listings, availability enquiries and booking management
- WhatsApp customer conversations
- Admin dashboard, staff roles and business reporting
- AI-assisted workflows and approved social-media operations

## Technology direction

- **Web app:** React + TypeScript + Vite (progressive-web-app-ready)
- **Backend:** Cloudflare Workers
- **Database:** Cloudflare D1 with migrations
- **Product media:** Cloudflare R2
- **Hosting:** Cloudflare Pages
- **Source and CI:** GitHub

Free-tier quotas and provider terms apply. Paid services will not be enabled without explicit approval.

## Security principles

- Never commit API keys, access tokens, passwords, customer records or private business data.
- Use environment secrets for server-side credentials.
- Keep customer, order, payment and rental data in the protected backend database.
- Validate and authorize every admin action on the server.
- Require human approval for refunds, payment actions, discounts, price changes, destructive operations and external commitments.
- Use official platform APIs and permission flows only.

## Delivery stages

1. Establish the responsive storefront and design system.
2. Add product catalogue, product details, cart and checkout request flow.
3. Add backend, database schema, COD order handling and admin authentication.
4. Add wholesale enquiries, inventory and quotations.
5. Add vehicle catalogue and rental enquiry/management workflows.
6. Add WhatsApp links, CRM and customer communication tools.
7. Add approved social integrations and AI provider adapters.
8. Add reporting, security review, testing and production deployment.

## Current status

Initial repository foundation. No live deployment, payment processing, external integrations or production credentials are configured yet.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## Business details still to be confirmed

Before enabling real checkout or rental bookings, confirm the official business phone/WhatsApp number, shop address and hours, delivery coverage/charges, COD rules, return/exchange policy, wholesale minimum quantities, product prices/stock, and vehicle fleet/rental terms.
