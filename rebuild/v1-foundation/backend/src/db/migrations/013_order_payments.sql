-- 013_order_payments.sql
-- PaymentIntent uniqueness guard (applies to bookings schema)

-- Ensure column exists on bookings (no-op if already present)
ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

DO $$
BEGIN
  IF to_regclass('public.bookings') IS NOT NULL THEN
    -- Create unique index (CI/local: possibly without CONCURRENTLY by migrator preprocess)
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uidx_bookings_payment_intent_id ON bookings (payment_intent_id) WHERE payment_intent_id IS NOT NULL';
    EXCEPTION WHEN others THEN
      -- ignore if already exists or predicate issues in old PG versions
      RAISE NOTICE 'Index creation skipped: %', SQLERRM;
    END;

    -- Optional history table with FK
    CREATE TABLE IF NOT EXISTS booking_payment_intents (
      id BIGSERIAL PRIMARY KEY,
      booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      payment_intent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (payment_intent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_booking_payment_intents_booking_id ON booking_payment_intents (booking_id);
  ELSE
    RAISE NOTICE 'bookings table not present; skipping order payment intent constraints';
  END IF;
END $$;


