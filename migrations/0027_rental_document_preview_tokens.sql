CREATE TABLE IF NOT EXISTS rental_document_preview_tokens (
  token_hash TEXT PRIMARY KEY,
  rental_request_id TEXT NOT NULL,
  document_side TEXT NOT NULL CHECK (document_side IN ('cnic_front','cnic_back')),
  admin_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rental_document_preview_expiry
  ON rental_document_preview_tokens(expires_at);
