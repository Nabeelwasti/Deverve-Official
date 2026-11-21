# De VERVE customer-care vouchers and CNIC evidence policy

## Voucher operating model

The voucher schema in migration 0037 is the persistence foundation, not a live checkout feature by itself. The customer-facing validation, staff workspace, transactional redemption, and notification flows must ship together before vouchers are advertised or enabled.

### Voucher purposes

- **Exchange compensation:** one customer, one exchange case, one redemption. Use when a customer returns an item because of a verified size issue, damaged item, wrong item, or colour/item mismatch and the business chooses store credit instead of a replacement or cash refund.
- **Goodwill:** service recovery for a documented complaint.
- **First order / loyalty / campaign:** controlled marketing offers with expiry, minimum basket, usage cap and per-customer limit.
- **Wholesale:** wholesale voucher redemption is reserved for a later phase; do not issue wholesale-purpose codes until quotation discounts are implemented and tested.
- **Manual adjustment:** owner/manager-approved correction with a mandatory reason and audit event.

### Safe defaults

- No automatic stacking: one promotion per order, consistent with the existing order discount columns.
- Exchange compensation vouchers are customer-bound, case-bound, single-use, and must be issued only after an authorised staff member records the case outcome.
- A damaged/wrong-item case should default to replacement or a staff-approved resolution; a voucher is optional compensation, not an automatic denial of refund rights.
- Size/colour exchanges should first offer a verified in-stock replacement. If the requested variant is unavailable, staff may issue a voucher or follow the published refund policy.
- Never create a voucher merely because an exchange request was submitted. Require review and a documented decision.
- Percent discounts are stored in basis points (1000 = 10%, 10000 = 100%). Fixed discounts and caps are stored in paisa.
- Checkout must validate eligibility and redeem atomically with order creation; do not rely on browser-side price calculations.
- Do not expose a voucher's customer identity or exchange details to another customer. Store only a hash of the full code; display the generated plaintext code once at issue time.
- The schema is intentionally limited to a single redemption per order and unique exchange-case redemption. Server-side race-safe usage increments and audit records are required in the API implementation.

### Suggested operational presets (not activated automatically)

| Purpose | Suggested default | Guardrails |
|---|---:|---|
| Size exchange inconvenience | 5% | One customer, one exchange case, 30 days |
| Verified wrong/damaged item goodwill | 10% | One customer, one exchange case, 30 days; manager approval |
| First order | 5% | One use per customer, 14 days, minimum basket set by owner |
| Loyalty thank-you | 5% | One use per customer, 30 days |
| Campaign | Owner-defined | Start/end date, total cap, per-customer cap |
| Wholesale | Not enabled | Do not issue until wholesale quotation redemption is implemented |

These percentages and durations are recommendations for configuration, not promises to customers. The owner should confirm margins and published terms before any campaign is activated.

## CNIC evidence handling

The current production implementation has a dedicated private R2 bucket, a retention Worker, upload-token expiry cleanup, and database protections against deleting or mutating rental-document records. The current project handover records the owner's instruction to retain rental CNIC evidence permanently. The app must therefore not invent an automatic purge date or delete identity evidence on a timer.

Minimum safeguards:
1. Keep CNIC objects private; never serve them from public product/media routes.
2. Require explicit customer consent before upload and explain the rental verification purpose.
3. Restrict retrieval to the smallest authorised rental-staff roles; log every view, download, and administrative action.
4. Use short-lived, one-time preview/download tokens and expire upload tokens promptly.
5. Never include CNIC images, raw object keys, or full identity numbers in email, WhatsApp, analytics, logs, exports, or general audit metadata.
6. Keep encrypted independent backups with access logging and a tested restore process.
7. Provide a documented process for access/correction complaints and legal holds.
8. Reconfirm the permanent-retention instruction with the owner and obtain Pakistan-qualified legal advice on lawful basis, customer notice, and retention duties before expanding collection.

**Important:** permanent retention is the currently recorded owner instruction, not a legal opinion that indefinite retention is required or lawful. Do not change the deployed bucket lock, database triggers, or delete existing evidence as part of routine development. Any future retention change requires a separately reviewed migration and a controlled R2 lifecycle/lock plan.

## Release status

Migration 0037 is only the database foundation. Do not apply it to production or expose a coupon input until the following are implemented and tested together:
- owner/manager coupon management UI with permission checks;
- secure code generation, hashing, one-time plaintext display and revocation;
- customer-bound exchange voucher issue flow with case linkage;
- checkout validation, atomic redemption and race-condition tests;
- audit history and customer notification templates;
- migration validation on a disposable D1 database and production backup/restore readiness.

Until then, existing checkout pricing and exchange workflow remain unchanged.
