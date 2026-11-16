-- Persist one server-selected promotion per order.
ALTER TABLE orders ADD COLUMN discount_code TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount_label TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_paisa >= 0 AND discount_amount_paisa <= subtotal_paisa);
ALTER TABLE orders ADD COLUMN free_delivery INTEGER NOT NULL DEFAULT 0 CHECK (free_delivery IN (0, 1));
