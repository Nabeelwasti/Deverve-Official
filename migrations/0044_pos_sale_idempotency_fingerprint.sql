-- Bind every POS idempotency key to the exact normalized checkout request.
-- Existing rows intentionally receive an empty fingerprint; a legacy key collision must be reconciled, never assumed identical.
ALTER TABLE pos_sales
  ADD COLUMN request_fingerprint TEXT NOT NULL DEFAULT '';
