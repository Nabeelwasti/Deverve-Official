# De VERVE backend foundation

This document records the current Worker API and D1 state. The Worker source is in GitHub but is not deployed. The Cloudflare D1 database `deverve-production` exists in APAC and all three migrations are applied. Cloudflare Pages and Worker deployment are not yet configured.

## API contract

### GET /api/health
Returns service and D1 connectivity status. It does not expose credentials or database details.

### GET /api/products
Returns published products only. Optional query parameters:
- `category`: exact category filter
- `limit`: integer from 1 to 60 (default 24)

### POST /api/enquiries
Accepts JSON:
```json
{
  "name": "Customer name",
  "phone": "+92 300 0000000",
  "email": "optional@example.com",
  "enquiryType": "retail",
  "message": "Please share available sizes.",
  "website": ""
}
```

Allowed enquiry types: `retail`, `wholesale`, `rental`, `general`. The optional `website` field is a honeypot and should remain empty. The endpoint validates input, caps request size, rejects cross-origin requests and stores the enquiry in D1.

## D1 schema

Repository migrations `0001_initial.sql`, `0002_commerce_os_foundation.sql` and `0003_admin_auth_throttling.sql` are applied to the production D1 database. They create 25 application tables covering catalogue, variants, enquiries, orders, wholesale, vehicles/rentals, admin authentication, CMS, media metadata, inventory movements and channel integration state. Live verification returned no foreign-key violations. No real business records have been inserted.

Money values are integer paisa, never floating-point rupees. Product and vehicle records start unpublished/draft. Do not insert fabricated products, stock, prices, vehicles or orders.

## Before connecting a production database

1. Create a D1 database in the Cloudflare account owned by the business.
2. Apply the migration to that database.
3. Create a Worker from `worker/index.ts`.
4. Add a D1 binding named `DB` pointing to that database.
5. Route the same-origin `/api/*` path to the Worker and serve the Vite `dist/` output as static assets.
6. Verify `GET /api/health`, `GET /api/products`, and a test enquiry before public launch.
7. Add an abuse-control layer such as Turnstile with server-side token verification before publishing the enquiry form broadly.

Do not paste credentials into GitHub files or chat. Do not connect a personal Cloudflare account or create paid resources without the owner's approval.

## Important security boundary

The Worker has admin authentication and a limited role-protected product management API, but there is no admin dashboard UI and no order/checkout creation endpoint. Do not expose the admin setup route until the deployment secret is configured and the production runtime is verified. The public enquiry API must not be used as an order or booking confirmation system.

## Admin authentication foundation (source implemented; deployment pending)

The Worker now defines these same-origin admin endpoints:

- `POST /api/admin/bootstrap`: creates the first and only owner account. It requires the server-side `ADMIN_BOOTSTRAP_TOKEN`, a valid email and a password of 12–128 characters. The database insert is conditional on there being no existing admin account, so concurrent bootstrap requests cannot create multiple owners.
- `POST /api/admin/login`: verifies the password and issues a 12-hour session.
- `GET /api/admin/me`: returns the current authenticated account and role.
- `POST /api/admin/logout`: revokes the current session.

Security controls in this foundation:

- Passwords use PBKDF2-HMAC-SHA-256 with a random 128-bit salt and 210,000 iterations.
- Session bearer tokens are 256-bit random values. Only SHA-256 token digests are stored in D1.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, host-only (`__Host-`) and scoped to `/`.
- Mutating auth requests require an exact same-origin `Origin` header and reject cross-site fetch metadata.
- Login failures are throttled per normalized email and Cloudflare client IP using a persistent digest key; after five failures the key is locked for 15 minutes. Raw IP addresses are not stored.
- Auth responses are always `no-store`; password hashes and session tokens are never returned.

### One-time deployment configuration

Before the first owner setup, create a high-entropy secret named `ADMIN_BOOTSTRAP_TOKEN` in the Worker environment. Use a password manager to generate at least 32 random characters. Never commit it to Git or place it in frontend configuration. The bootstrap token is a one-time setup gate; remove/rotate it after owner creation. Cloudflare Pages/Worker deployment remains pending until the GitHub App is connected. The D1 schema migrations have been applied and verified separately.

### Current boundary

This is the authentication API foundation, not a finished admin dashboard. No product, order, CMS, inventory, rental or staff-management write endpoints are exposed yet. Every future admin mutation must call the server-side session check and enforce role permissions before touching D1. The admin UI must not be enabled until this and the full authorization layer have been tested against the deployed Worker.
