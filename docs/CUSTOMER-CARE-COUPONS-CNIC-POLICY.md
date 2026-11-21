# De VERVE customer-care vouchers and CNIC evidence policy

## Voucher operating model

The voucher workflow is implemented in the current feature branch and is intended to ship as one controlled release with migration 0037. It includes an owner/manager workspace, secure code generation and hash-only storage, one-time code display, revocation, customer checkout validation, server-side revalidation, atomic redemption, database eligibility triggers, audit history and an explicit WhatsApp share hand-off. The production database and live storefront must not be treated as updated until the PR is merged, migration 0037 is applied, and the controlled Pages deployment succeeds.

### Voucher purposes

- **Exchange compensation:** one customer, one completed exchange case, one redemption. Use for verified size issues, damaged items, wrong items and documented colour/variant mismatches when a manager chooses store credit instead of a replacement or cash refund.
- **Goodwill:** service recovery for a documented complaint.
- **First order / loyalty / campaign:** controlled offers with an expiry, minimum basket, total usage cap and per-customer limit.
- **Wholesale:** wholesale voucher redemption remains disabled until quotation discounts are implemented and tested.
- **Manual adjustment:** owner/manager-approved correction. The voucher title and audit record must describe the reason.

### Purpose-based starting presets

The workspace prefills these conservative starting values when a manager selects a purpose. They are editable before issue, are not automatic customer promises, and require the authorised manager to review the margin and click Generate voucher.

| Purpose | Prefilled starting offer | Expiry and limits |
|---|---:|---|
| Size exchange | 5%, capped at Rs. 500 | 30 days; one customer, one completed case, one use |
| Damaged item | 10%, capped at Rs. 1,000 | 30 days; one customer, one completed case, one use |
| Wrong item / colour mismatch | 10%, capped at Rs. 1,000 | 30 days; one customer, one completed case, one use |
| General exchange compensation | 5%, capped at Rs. 500 | 30 days; one customer, one completed case, one use |
| First order | 5%, capped at Rs. 500 | 30 days; 1 use per customer; 1,000 total uses by default |
| Loyalty | 5%, capped at Rs. 500 | 30 days; 1 use per customer; 1,000 total uses by default |
| Goodwill | 5%, capped at Rs. 500 | 30 days; 1 use per customer; 100 total uses by default |
| Campaign | 5%, capped at Rs. 500 | 30 days; 1 use per customer; 100 total uses by default |
| Manual adjustment | 5%, capped at Rs. 500 | 30 days; single use by default |

Managers can adjust these values before issue. Do not promise the presets in marketing material until the owner confirms margin and campaign terms. Wholesale is not available in the voucher workspace.

### Safeguards

- One voucher per order; promotions never stack.
- Exchange vouchers are linked to a specific customer and completed exchange case, and are single-use. A submitted or merely approved request is not enough; the case must reach completed status.
- A damaged/wrong-item case should default to replacement or a staff-approved resolution. A voucher is optional compensation, not a way to deny statutory or published refund rights.
- Size/colour exchanges should first offer a verified in-stock replacement. If the requested variant is unavailable, an authorised manager may issue compensation or follow the published refund policy.
- First-order vouchers are rejected if the customer has any previous non-cancelled order.
- Wholesale voucher redemption is rejected by the database trigger until a separate quote-to-order discount workflow exists.
- Percent discounts are stored in basis points; fixed amounts and caps are stored in paisa.
- Checkout validates the signed-in customer, start/expiry, minimum subtotal, customer/case binding and usage limits again on the server. Redemption is inserted in the same D1 checkout batch as order creation; database triggers validate eligibility, increment usage and make redemption history immutable.
- The browser does not persist voucher codes in checkout drafts. Plaintext codes are shown once when issued; only a hash and short prefix are stored.
- The WhatsApp action opens a prefilled message for a staff member to review and send. The system does not silently send a message or assume customer consent.

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

PR #7 contains the voucher UI, API, checkout and policy implementation. Migration 0037 is not yet applied to production. The feature must not be exposed on the live site until:
- the exact latest PR head passes CI;
- a fresh production D1 export and recovery bookmark are recorded;
- migration 0037 is applied and its tables, indexes, triggers and foreign keys are verified;
- the exact merged main commit is deployed to Pages and smoke-tested.

Independent off-account D1/R2 disaster recovery, physical Android camera/scanner acceptance, stock reconciliation, real provider integration tests, POS/finance reconciliation, rental acceptance and owner/legal CNIC approval remain separate production-acceptance gates.
