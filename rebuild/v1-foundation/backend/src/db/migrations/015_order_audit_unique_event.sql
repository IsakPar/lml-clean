-- Unique processed-event idempotency at the domain boundary
CREATE UNIQUE INDEX IF NOT EXISTS uidx_order_audit_event
  ON order_audit_log ((metadata->>'stripe_event_id'))
  WHERE metadata ? 'stripe_event_id';


