> **Historical snapshot:** This audit records the evidence available at commit `3b200665a49e16524cdf4a4080d92fc9d818f0fb` before the customer-chat release was merged. It is not a statement of the current `main` or live deployment state. The reconciliation branch based on the newer `main` is tracked separately in PR #13; re-run the relevant production checks before relying on any current-state conclusion below.

# Production audit — 21 November 2026

## Scope and evidence

This is a read-only reconciliation of the GitHub main branch, Cloudflare Pages, production D1 schema/data counts, R2 lock configuration, Worker bindings, and a mobile-viewport Cloudflare Browser Rendering check. No production database rows, CNIC objects, R2 locks, secrets, provider settings, or deployments were changed during this audit. No customer names, phone numbers, CNIC numbers, document keys, or credentials are recorded here.

## Source and release state

- Repository: `Nabeelwasti/Deverve-Official`; production branch: `main`.
- Main head at audit: `3b200665a49e16524cdf4a4080d92fc9d818f0fb`.
- Cloudflare Pages latest deployment: `7138c1bb-eb95-4561-b23b-ee5fec0c8ebe`; deployment URL: https://7138c1bb.deverve-official.pages.dev; source commit: `3b200665a49e16524cdf4a4080d92fc9d818f0fb`. Queued, initialize, clone, build and deploy stages all reported success.
- Live Pages source settings currently report GitHub `main`, production deployments enabled, automatic deployments enabled, and preview deployments set to `none`. This differs from older README/handover text that says production deployments are disabled.
- In the latest ten deployment records inspected, two were skipped with `superseded_queued_build` (`78a0b0d` and `703a6a2`); these were not failed builds. The current `3b20066` deployment completed successfully. The other inspected recent deployment records completed successfully.
- The latest full CI runs whose job details could be retrieved were `44882915815` and `44902016578`; their build, dependency audit, Worker, schema/security-header and browser-test steps passed. Run `44902016578` is tied to an older main commit (`b575306`), not the current 21 November UI/category-artwork changes. The isolated remote D1 integration step was skipped when Cloudflare test credentials were absent. No current-head CI result is claimed in this audit.
- A mobile-viewport production browser-rendering request returned the live storefront HTML and title `De VERVE | Elevate Your Style — Jhelum, Pakistan`. It contains the neutral review line “Customer experiences, shared in their own words.” and does not contain the removed line “Only feedback approved for public display appears here.” This is a browser-rendered origin check, not physical Android acceptance.
- Only `deverve-official.pages.dev` is configured; no custom domain is attached.

## Production D1 read-only checks

- D1 database: `deverve-production`; 65 application tables excluding SQLite internal tables.
- `PRAGMA foreign_key_check` returned zero rows.
- Current counts: 5 products (3 published, 2 drafts), 7 active variants, 1 vehicle, 1 rental request, 2 rental documents, 1 order, 1 inventory reservation, 1 POS sale, and 13 ready media assets.
- The only order is cancelled with payment pending and delivery fee declined. Its inventory reservation is released. The only POS sale is voided. No orphaned active inventory reservation was found.
- Product-data warnings remain: one active variant has a blank colour; one legacy variant row combines comma-separated sizes and colours under one shared stock balance; product `T2` is published but has no linked product-media record; `Tolaza` has two linked media assets but no legacy `image_key`. These records require owner-approved source data and physical stock/photo verification. Do not invent or split stock quantities.
- `site_pages` contains zero rows. The CMS homepage designer is available, but no CMS homepage has been published; the static storefront remains the homepage.
- The four recently added category artwork controls are code capability. The owner has not yet selected/uploaded final artwork for those cards.

## CNIC retention — critical policy/technical mismatch

The owner-confirmed operating policy in the project record is deletion 90 days after all payments, damages, charges, fees, challans and related obligations are fully cleared, with owner/authorised-manager review of deletion requests and documented holds.

The live implementation does not enforce that policy:

- Production D1 still has `trg_rental_documents_no_delete` and `trg_rental_documents_no_update`; the first aborts deletion of every rental document row.
- R2 bucket `deverve-media-private` has an enabled `Indefinite` lock for prefix `rental-private/`.
- R2 bucket `deverve-db-backups` also has an enabled `Indefinite` lock for prefix `rental-private/`.
- The scheduled `deverve-cnic-retention` Worker runs daily at 03:00 UTC, but its source only expires temporary upload-token fields. It reports `automatic_document_deletion:false` and never deletes CNIC objects.
- The admin CNIC document DELETE route returns HTTP 409 and says in-app deletion is disabled.
- Two private rental-document objects currently exist under the protected prefix.

Cloudflare's current Bucket Locks documentation states that lock rules protect existing and future matching objects, block deletes/overwrites including lifecycle deletion, and take precedence over lifecycle rules. Therefore adding a 90-day lifecycle rule to the existing locked prefix would not implement the owner's policy. Do not remove the existing lock or D1 triggers as a shortcut.

A safe transition requires a reviewed additive migration and a separate private storage path/bucket for new records, explicit full-clearance evidence, a one-time 90-day due timestamp, owner/manager deletion-request decisions, auditable legal holds/reviews, idempotent deletion/reconciliation, backup expiry and verified recovery. Legacy locked objects need a documented exception/transition decision; they must not be silently deleted. A full retention/restore rehearsal must precede production activation.

## Backups and recovery

- The same-account R2 backup bucket `deverve-db-backups` currently contains one object under `d1/`, zero under `media/`, and zero under `rental-private/`.
- The bucket has 35-day age locks for `d1/` and `media/`, plus an indefinite lock for `rental-private/`.
- The live media bucket has two CNIC objects under the indefinite lock.
- This is not an off-account backup. No independent off-account D1 + media + CNIC recovery copy was verified in this audit. A previous same-account R2 restore drill does not satisfy the independent disaster-recovery gate.
- A complete recovery test must verify schema, data, R2 bytes, metadata, access controls and application restore in an isolated destination. Do not export personal/CNIC data to an unverified personal cloud account.

## Integrations and device acceptance

- A separate `deverve-turnstile-verify` Worker exists and has a `TURNSTILE_SECRET` binding. A real production challenge/token acceptance test remains outstanding.
- The `deverve-cnic-retention` Worker has D1 and private R2 bindings and its daily schedule; no secrets are bound to it.
- The Pages production configuration exposes D1 and private R2 bindings and masked secret settings. Provider acceptance must be based on real end-to-end tests, not the existence of code or a secret name.
- Safepay Queue/DLQ and complete sandbox reconciliation remain unaccepted; COD remains the safe fallback.
- Resend sender verification and delivery, Meta WhatsApp template/opt-in/delivery, and real Gemini key decryption/provider response remain unaccepted.
- Physical Android camera permissions, autofocus, torch/low-light/glare, QR/Code128 recognition, repeated scans and fallback paths have not been physically accepted.
- Physical inventory count, POS/finance reconciliation, and the full vehicle rental lifecycle (eligibility, agreement, deposit, handover, inspection, return, damages/challans, settlement and clearance) remain operational acceptance tasks.
- Owner-signed policies, named staff authorisations, approved catalogue/vehicle data and final operational sign-off remain outstanding.

## Release assessment

The latest Pages deployment is successful and the live storefront contains the updated review wording. This does not establish full production readiness. The current source still requires current-head CI verification, isolated D1 integration tests, independent off-account recovery, a technically correct CNIC retention transition, real provider tests, physical-device testing, owner-verified inventory and full rental/POS operational acceptance.

No production mutation or deployment is authorised by this audit document. Keep COD as the active checkout fallback and keep CNIC deletion disabled until the safe retention transition has passed isolated tests and the formal release gates.
