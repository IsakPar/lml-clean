-- 015_orders_payment_intent_unique.sql
-- Run only after the orders table exists in this codebase.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uidx_orders_payment_intent_id
  ON orders (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;


