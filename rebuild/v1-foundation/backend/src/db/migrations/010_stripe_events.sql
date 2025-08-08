-- 010_stripe_events.sql
-- Durable Stripe event store for webhook idempotency and audit

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,
  api_version TEXT,
  idempotency_key TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stripe_created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_created_at
  ON stripe_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type
  ON stripe_events (type);


