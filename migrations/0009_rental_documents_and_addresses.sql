-- Full rental pickup/destination details and private, token-authorized CNIC document uploads.
ALTER TABLE rental_requests ADD COLUMN pickup_city TEXT NOT NULL DEFAULT 'Jhelum';
ALTER TABLE rental_requests ADD COLUMN pickup_address TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_requests ADD COLUMN destination_city TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_requests ADD COLUMN destination_address TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_requests ADD COLUMN document_upload_token_hash TEXT;
ALTER TABLE rental_requests ADD COLUMN document_upload_expires_at TEXT;

CREATE TABLE IF NOT EXISTS rental_documents (
  id TEXT PRIMARY KEY,
  rental_request_id TEXT NOT NULL REFERENCES rental_requests(id) ON DELETE CASCADE,
  document_side TEXT NOT NULL CHECK (document_side IN ('cnic_front','cnic_back')),
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 4000000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(rental_request_id, document_side)
);
CREATE INDEX IF NOT EXISTS idx_rental_documents_request ON rental_documents(rental_request_id, created_at);
