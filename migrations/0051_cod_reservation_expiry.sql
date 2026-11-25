-- Bound unpaid manual COD reservations so abandoned orders cannot hoard stock indefinitely.
-- Online Safepay reservations remain unexpired here; provider callbacks keep their existing lifecycle.
ALTER TABLE order_inventory_reservations ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_order_inventory_reservations_expiry
  ON order_inventory_reservations(status, payment_provider, expires_at);

-- Give already-open manual COD orders a 24-hour grace period after this migration.
-- Existing orders are not cancelled by the migration itself.
UPDATE order_inventory_reservations
SET expires_at = COALESCE(
  (
    SELECT CASE
      WHEN o.delivery_fee_status='awaiting_customer'
       AND o.delivery_fee_expires_at IS NOT NULL
       AND o.delivery_fee_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      THEN o.delivery_fee_expires_at
      ELSE NULL
    END
    FROM orders o
    WHERE o.id = order_inventory_reservations.order_id
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+24 hours')
)
WHERE status='reserved'
  AND payment_provider='manual'
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id=order_inventory_reservations.order_id
      AND o.order_status='pending'
      AND o.payment_status='pending'
      AND o.payment_method='cod'
      AND o.payment_provider='manual'
  );
