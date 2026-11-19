-- Durable AI task continuity across model and API-key switches.
-- Store task summaries, decisions and results; never store hidden chain-of-thought or API keys.
CREATE TABLE IF NOT EXISTS ai_task_runs (
  id TEXT PRIMARY KEY,
  created_by_admin_id TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('chat','product','research')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','partial','completed','failed')),
  current_step TEXT NOT NULL DEFAULT 'queued',
  completed_batches INTEGER NOT NULL DEFAULT 0,
  failed_batches INTEGER NOT NULL DEFAULT 0,
  context_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_task_runs_owner_updated
  ON ai_task_runs(created_by_admin_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS ai_task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  batch_index INTEGER,
  model TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_task_events_task_created
  ON ai_task_events(task_id, created_at);
