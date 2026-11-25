-- Exclusive, recoverable lease for scheduled CNIC retention jobs.
-- A claim is unique to one Worker execution and expires if that execution stops.
ALTER TABLE rental_requests ADD COLUMN cnic_retention_claim_token TEXT;
ALTER TABLE rental_requests ADD COLUMN cnic_retention_claim_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_rental_cnic_retention_claim
  ON rental_requests(cnic_retention_status, cnic_retention_claim_expires_at, cnic_retention_due_at);
