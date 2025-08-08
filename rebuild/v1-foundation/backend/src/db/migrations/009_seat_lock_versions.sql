-- 009_seat_lock_versions.sql
-- Monotonic fencing token registry per seat

CREATE TABLE IF NOT EXISTS seat_lock_versions (
  seat_id UUID PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monotonic bump pattern (application code within a transaction):
-- INSERT INTO seat_lock_versions (seat_id, version) VALUES ($1, 0)
--   ON CONFLICT (seat_id) DO NOTHING;
-- UPDATE seat_lock_versions SET version = version + 1, updated_at = NOW()
--   WHERE seat_id = $1 RETURNING version;


