# De VERVE — focused payment and inventory audit addendum

**Audit date:** 19 November 2026  
**Audited source:** `fix/variants-camera-multilingual`  
**Audited commit:** `685b858b2318e34e296beee02c9d50579ff61bc3`  
**Scope:** source-level review of checkout and Safepay webhook reconciliation. This is not a live payment test.

## Finding PAY-01 — Safepay success reconciliation can partially commit

**Severity: High — release blocker before enabling Safepay.**

In `worker/index.ts` around lines 3449–3452, the `payment.succeeded` handler batches three writes:

1. Mark the payment attempt `succeeded`.
2. Mark the matching order `paid`, subject to provider, amount, delivery-fee and order-state conditions.
3. Insert the gateway-clearing financial transaction if the order now appears paid.

After the D1 batch returns, the code checks each statement's `meta.changes` and throws if any is not exactly one.

**Problem:** a D1 batch provides transactional behavior for SQL execution failures, but a statement that executes successfully and affects zero rows is not itself an SQL failure. The post-batch JavaScript check happens after the batch has completed. Therefore, if the payment-attempt update affects one row but the order update affects zero rows (for example, a state/amount/delivery gate mismatch or concurrent state transition), the attempt may already be committed as `succeeded` while the order remains unpaid and the ledger row is absent. A retry then encounters an attempt no longer in `created/pending`, so the normal success path cannot safely reconcile it.

**Required correction before Safepay activation:**

- Redesign the SQL batch so each write is conditional on the full prerequisite state and the writes form one consistent state transition. In particular, the attempt must only become `succeeded` if the corresponding order is successfully moved to `paid`; the ledger row must only be inserted for that same transition.
- Prefer a single guarded transition statement or mutually dependent conditional statements whose zero-row outcomes cannot leave an earlier write committed. Do not rely on checking `meta.changes` after a successful batch to provide rollback.
- Persist a recoverable reconciliation state for genuine provider success that cannot yet be applied (e.g. awaiting delivery approval/order-state resolution), rather than consuming the attempt as succeeded or treating the payment as failed.
- Make replay behavior deterministic and idempotent for duplicate and delayed provider events. Detect and reject a reused provider event ID with a different payload digest instead of silently replacing the stored digest.
- Add D1-backed integration tests for: normal success; duplicate event; same event ID/different payload; delayed success; wrong amount/currency/state; order no longer eligible; duplicate concurrent delivery; failure followed by later success; and ledger exactly-once behavior.
- Verify provider event ordering and the exact Safepay signature/event contract against current official documentation and sandbox fixtures before live enablement.

**Current handling:** Safepay remains gated by provider configuration and is not accepted as production-ready. Do not add live credentials or enable live transactions until the correction and tests are complete.

## Finding INV-01 — POS stock guard is improved but not integration-certified

The current branch adds a conditional sale insert requiring every selected active published variant to have sufficient unreserved stock, and makes dependent POS records conditional on the sale existing. The helper unit test checks SQL construction and bindings only.

**Required before release:** test the complete D1 batch against a real/compatible isolated D1 database with simultaneous POS and online checkout attempts for the final unit, duplicate variant lines, rollback, payment/ledger/outbox row counts, and retry behavior. Confirm no oversell and no orphan sale or financial records.

## Positive observations in this focused review

- Checkout re-reads authoritative product/variant pricing and stock; it does not trust client-submitted prices.
- Checkout validates the customer session, Turnstile, checkout token and selected enabled payment method.
- Variant-level stock reservations are written inside the checkout batch and the initial order insert is guarded against insufficient stock.
- Safepay webhook handling verifies the signature before parsing and validates final state, PKR currency and exact stored amount before marking an order paid.
- POS stock guard rejects empty/invalid quantities and combines repeated variant IDs before constructing the guard.

## Release status

This source review identified a payment-reconciliation defect that must be fixed before Safepay can be enabled. Automated CI passing does not cover this state-transition failure. Keep the PR draft/unmerged and do not deploy or apply production migrations under the existing owner instruction.
