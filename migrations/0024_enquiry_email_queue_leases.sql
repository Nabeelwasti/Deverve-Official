-- Recover queued website-enquiry emails if a Pages invocation is interrupted mid-send.
ALTER TABLE enquiry_email_queue ADD COLUMN processing_started_at TEXT;
CREATE INDEX IF NOT EXISTS idx_enquiry_email_queue_lease
  ON enquiry_email_queue(status,next_attempt_at,processing_started_at,created_at);
