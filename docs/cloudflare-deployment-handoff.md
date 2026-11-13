# Cloudflare deployment handoff

## Current provisioned resources

- D1 database: `deverve-production`
- Primary region hint: APAC
- Database schema: `migrations/0001_initial.sql` applied successfully
- Pages Functions catch-all API route: `functions/api/[[path]].ts`
- Shared API implementation: `worker/index.ts`
- Required D1 binding name: `DB`

## Git integration blocker

The Cloudflare API can read the account and create the D1 database, but Cloudflare Pages project creation currently fails with Cloudflare error `8000011`: internal issue with the Cloudflare Pages Git installation. The Pages Write permission is present. Do not keep retrying the API call.

An account owner must repair/reinstall the Cloudflare Pages GitHub app connection for the GitHub account/repository, then create or reconnect the Pages project to `Nabeelwasti/Deverve-Official` (production branch `main`). Configure:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`
- Production D1 binding: `DB` → existing `deverve-production` database
- Preview deployments: disabled until a separate non-production D1 database is provisioned

Do not create a second D1 database. Do not attach the production database to preview deployments.

## Post-connection verification

1. Confirm the first Pages production deployment is green.
2. Confirm `GET /api/health` returns `{"status":"ok","database":"connected"}`.
3. Confirm `GET /api/products` returns an empty list until real products are entered.
4. Submit a test enquiry using a clearly labelled internal test record, then remove it after verifying the flow.
5. Test install prompt and offline shell on Android Chrome; test Add to Home Screen on iOS Safari.
6. Add the custom domain only after the owner confirms the domain and DNS access.

## Launch blockers

- Add a secure admin authentication system before exposing any admin interface.
- Add server-side order pricing, stock validation, idempotency and COD order persistence before enabling checkout.
- Confirm delivery coverage/charges, COD rules, exchange/return policy, product prices/stock and business contact details.
- Do not expose customer or order records in public endpoints.
