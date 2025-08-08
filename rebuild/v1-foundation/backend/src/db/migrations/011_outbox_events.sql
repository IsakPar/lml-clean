-- 011_outbox_events.sql
-- Transactional outbox table for deferred side-effects

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','SENT','FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created
  ON outbox_events (status, created_at);

CREATE INDEX IF NOT EXISTS idx_outbox_scheduled
  ON outbox_events (scheduled_at) WHERE scheduled_at IS NOT NULL;


