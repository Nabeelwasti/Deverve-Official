-- Make owner notification delivery recoverable after a Worker interruption.
-- Existing queued/sent/failed rows are preserved; the lease starts empty for old rows.
ALTER TABLE notification_outbox ADD COLUMN processing_started_at TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_lease
  ON notification_outbox(status,next_attempt_at,processing_started_at,created_at);
