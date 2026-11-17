-- Durable email queue for website enquiries and feedback.
CREATE TABLE IF NOT EXISTS enquiry_email_queue (
 id TEXT PRIMARY KEY,
 enquiry_id TEXT NOT NULL UNIQUE REFERENCES enquiries(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 next_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 processing_started_at TEXT,
 last_error_code TEXT,
 provider_message_id TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_enquiry_email_queue_due ON enquiry_email_queue(status,next_attempt_at);
