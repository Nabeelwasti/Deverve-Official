# De VERVE unpaid COD reservation expiry

- New manual COD stock reservations receive a 24-hour expiry timestamp.
- Existing open manual COD reservations receive a one-time 24-hour grace period when migration 0051 is applied; the migration itself does not cancel orders or release stock.
- Online Safepay reservations have no automatic expiry from this workflow. Payment-provider callback/reconciliation behavior remains authoritative.
- A scheduled Worker checks due orders every five minutes. It only considers orders still pending, unpaid, manual COD, with every reservation expired and no active Safepay attempt.
- Cancellation, reserved-stock release, reservation-ledger transition, order-status event and audit log are written in one D1 batch. A stale/raced order is skipped. Missing variants or insufficient reservation quantities prevent cancellation.
- Customer-visible order history shows the order as cancelled. The business must not manually collect payment for a cancelled order; create a fresh order if the customer still wants the items.
- The release worker does not change physical stock_on_hand; it only reduces reserved_quantity.
