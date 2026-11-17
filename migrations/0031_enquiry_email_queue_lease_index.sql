-- The base enquiry_email_queue migration already contains processing_started_at.
-- Add the composite lease index only; do not re-add the existing column.
CREATE INDEX IF NOT EXISTS idx_enquiry_email_queue_lease
  ON enquiry_email_queue(status,next_attempt_at,processing_started_at,created_at);
