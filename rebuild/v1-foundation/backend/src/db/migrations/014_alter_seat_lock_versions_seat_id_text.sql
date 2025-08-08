-- 014_alter_seat_lock_versions_seat_id_text.sql
-- Align seat_lock_versions.seat_id type with application (TEXT identifiers)

ALTER TABLE IF EXISTS seat_lock_versions
  ALTER COLUMN seat_id TYPE TEXT USING seat_id::text;


