-- 012_order_audit_log.sql
-- Immutable audit log for order FSM transitions

CREATE TABLE IF NOT EXISTS order_audit_log (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL,
  actor_id UUID,
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('user','system','admin')),
  action TEXT NOT NULL,
  prev_state TEXT,
  next_state TEXT,
  reason TEXT,
  ip_hash TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_audit_order_id_created
  ON order_audit_log (order_id, created_at DESC);


