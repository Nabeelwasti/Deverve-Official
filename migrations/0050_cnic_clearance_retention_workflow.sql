-- Owner/manager-controlled CNIC clearance and 90-day post-clearance retention.
-- Existing rentals remain not_cleared; no historical clearance is inferred.
ALTER TABLE rental_requests ADD COLUMN cnic_clearance_at TEXT;
ALTER TABLE rental_requests ADD COLUMN cnic_clearance_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE rental_requests ADD COLUMN cnic_clearance_note TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_requests ADD COLUMN cnic_retention_due_at TEXT;
ALTER TABLE rental_requests ADD COLUMN cnic_retention_status TEXT NOT NULL DEFAULT 'not_cleared'
  CHECK (cnic_retention_status IN ('not_cleared','scheduled','purging','retry','deleted'));
ALTER TABLE rental_requests ADD COLUMN cnic_retention_deleted_at TEXT;
ALTER TABLE rental_requests ADD COLUMN cnic_retention_last_error TEXT;

CREATE TABLE IF NOT EXISTS rental_cnic_holds (
  id TEXT PRIMARY KEY,
  rental_request_id TEXT NOT NULL REFERENCES rental_requests(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 10),
  placed_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  placed_at TEXT NOT NULL,
  review_at TEXT NOT NULL,
  released_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  released_at TEXT,
  release_note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_cnic_holds_one_active
  ON rental_cnic_holds(rental_request_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rental_cnic_holds_review
  ON rental_cnic_holds(released_at, review_at);

CREATE INDEX IF NOT EXISTS idx_rental_cnic_retention_due
  ON rental_requests(cnic_retention_status, cnic_retention_due_at);

-- Replace the old permanent-delete prohibition with a strict scheduler-only gate.
-- Metadata can be removed only after full clearance + 90 days, while the rental
-- is explicitly marked purging and no active legal/business hold exists.
DROP TRIGGER IF EXISTS trg_rental_documents_no_delete;
CREATE TRIGGER IF NOT EXISTS trg_rental_documents_delete_requires_due_clearance
BEFORE DELETE ON rental_documents
WHEN NOT EXISTS (
  SELECT 1 FROM rental_requests r
  WHERE r.id = OLD.rental_request_id
    AND r.cnic_retention_status = 'purging'
    AND r.cnic_retention_due_at IS NOT NULL
    AND r.cnic_retention_due_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
OR EXISTS (
  SELECT 1 FROM rental_cnic_holds h
  WHERE h.rental_request_id = OLD.rental_request_id
    AND h.released_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'CNIC deletion requires recorded clearance, 90-day expiry and no active hold');
END;

CREATE TRIGGER IF NOT EXISTS trg_rental_cnic_clearance_immutable
BEFORE UPDATE OF cnic_clearance_at, cnic_clearance_by_admin_id, cnic_clearance_note, cnic_retention_due_at
ON rental_requests
WHEN OLD.cnic_clearance_at IS NOT NULL
 AND (
   NEW.cnic_clearance_at IS NOT OLD.cnic_clearance_at
   OR NEW.cnic_clearance_by_admin_id IS NOT OLD.cnic_clearance_by_admin_id
   OR NEW.cnic_retention_due_at IS NOT OLD.cnic_retention_due_at
 )
BEGIN
  SELECT RAISE(ABORT, 'Recorded CNIC clearance and retention deadline are immutable');
END;
