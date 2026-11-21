-- Record the exact customer-facing CNIC notice acknowledged at rental submission.
-- Existing records are marked legacy-unknown; do not backfill consent that was not captured.
ALTER TABLE rental_requests ADD COLUMN cnic_consent_version TEXT NOT NULL DEFAULT 'legacy-unknown';
ALTER TABLE rental_requests ADD COLUMN cnic_consent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_rental_requests_cnic_consent
  ON rental_requests(cnic_consent_version, cnic_consent_at);
