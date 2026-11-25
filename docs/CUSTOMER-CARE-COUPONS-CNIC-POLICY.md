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

The owner has now confirmed a defined rental-CNIC policy. Every customer requesting a vehicle rental must submit both sides of the CNIC for identity matching, rental approval, fraud prevention/security for premium and high-value vehicles, and legitimate rental-history verification. Only the owner and specifically authorized relevant rental manager/staff may view it.

**Owner-selected retention rule:** delete CNIC images after 90 days from successful clearance of all payments, damages, charges, challans (if any), penalties and other relevant fees. The clock must not start until an authorised owner or manager records final clearance after full reconciliation. A customer may request deletion; staff review and the owner or specifically authorized manager decides and records reasons. Legal holds and unresolved obligations must be assessed before deletion. This policy is captured in `docs/CNIC-RETENTION-APPROVAL-RECORD.md`; formal owner signature remains pending; no external lawyer review is claimed or recorded.

Minimum safeguards:
1. Keep CNIC objects private; never serve them from public product/media routes.
2. Show a clear customer notice and obtain recorded affirmative acknowledgement before upload; disclose purposes, access roles, retention rule and request process.
3. Restrict retrieval to named owner/rental roles; enforce authorization server-side and log every view, download, decision and administrative action.
4. Use short-lived authenticated preview/download access; expire upload tokens promptly.
5. Never include CNIC images, raw object keys, or full identity numbers in email, WhatsApp, analytics, logs, exports, AI prompts or general audit metadata.
6. Keep encrypted independent backups with access logging and a tested restore and deletion-expiry process.
7. Provide a documented deletion-request review, customer response and legal-hold workflow.
8. Do not extend retention or destroy evidence outside the recorded schedule and approved exception process.

**Important:** the 90-day rule is the owner's business policy, not a legal opinion that this exact period is required or lawful. PECA 2016 (as amended) and other applicable law require careful authorization and confidentiality handling. Obtain written Pakistan-qualified legal advice on the full-copy requirement, customer notice, retention, exceptions, cloud processing and deletion rights. Do not change deployed bucket locks, database triggers or delete existing evidence until a separately reviewed migration and tested R2 lifecycle/hold plan is ready.

## Release status — verified 21 November 2026

- Migration `0037_discount_coupons.sql` has been applied to production D1 `deverve-production`.
- Production verification confirmed both coupon tables, all six coupon indexes, all six coupon triggers and zero foreign-key violations.
- The restored copy of the 21 November D1 SQL backup was also tested with migration 0037 in an isolated disposable D1 database; that temporary database was deleted after verification.
- GitHub main commit `b575306e0ed251d81079a54f8fc61f9d0ecbbc8d` passed CI run [44902016578](https://github.com/Nabeelwasti/Deverve-Official/actions/runs/44902016578).
- Cloudflare Pages production deployment `7cc647dd-b275-4682-b46d-ae8455c1493d` successfully deployed that exact commit to [https://7cc647dd.deverve-official.pages.dev](https://7cc647dd.deverve-official.pages.dev).

The voucher database foundation is live. Do not infer that a real voucher has been issued, that checkout has been smoke-tested against the public origin, or that email/WhatsApp delivery is automatic. Independent off-account disaster recovery, physical Android camera/scanner acceptance, stock reconciliation, real provider integration tests, POS/finance reconciliation, rental acceptance and formal owner policy signature and technical CNIC retention acceptance remain separate operational gates.
