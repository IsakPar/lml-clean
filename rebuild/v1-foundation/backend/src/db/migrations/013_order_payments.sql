-- 013_order_payments.sql (DDL-only; migrator-safe)
-- Add minimal columns and history table without DO blocks

-- Add the column if the orders table exists (no-op otherwise)
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

-- Optional history table (safe now)
CREATE TABLE IF NOT EXISTS order_payment_intents (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL,
  payment_intent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_order_payment_intents_order_id
  ON order_payment_intents (order_id);


