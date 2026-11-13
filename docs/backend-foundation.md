# De VERVE backend foundation

This stage adds a Cloudflare Worker API and the first D1 schema migration. It is source code only: it has not been deployed and no Cloudflare resources have been created.

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

Apply `migrations/0001_initial.sql` to a new D1 database. It creates catalogue, variants, enquiries, COD order, wholesale quotation, vehicle, rental request, admin-user and audit-log tables.

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

The current Worker intentionally has no admin routes and no checkout/order-creation endpoint. The `admin_users` table is only a schema placeholder; authentication, session management, role enforcement, password hashing, CSRF controls and audit enforcement must be implemented before any admin interface is exposed. The public enquiry API must not be used as an order or booking confirmation system.
