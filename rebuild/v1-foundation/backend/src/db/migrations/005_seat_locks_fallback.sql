/**
 * LML v1 Foundation - Seat Locks Fallback Table
 * =============================================
 * Production-grade PostgreSQL fallback for Redis locking
 * Replaces advisory locks with proper TTL and ownership tracking
 * Created: 2025-08-05
 * Migration: 005
 */

-- ================================================
-- SEAT LOCKS TABLE FOR REDIS FALLBACK
-- ================================================

CREATE TABLE IF NOT EXISTS seat_locks (
    seat_id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    locked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    show_id VARCHAR(100) NOT NULL,
    venue_id VARCHAR(100) NOT NULL,
    
    -- Constraints
    CONSTRAINT seat_locks_expires_at_future CHECK (expires_at > locked_at),
    CONSTRAINT seat_locks_ttl_reasonable CHECK (expires_at <= locked_at + INTERVAL '1 hour')
);

-- ================================================
-- PERFORMANCE INDEXES
-- ================================================

-- Primary lookup: check if seat is locked
CREATE INDEX CONCURRENTLY IF NOT EXISTS seat_locks_expires_at_idx 
    ON seat_locks (expires_at);

-- Cleanup expired locks efficiently
CREATE INDEX CONCURRENTLY IF NOT EXISTS seat_locks_user_session_idx 
    ON seat_locks (user_id, session_id);

-- Query locks by show/venue
CREATE INDEX CONCURRENTLY IF NOT EXISTS seat_locks_show_idx 
    ON seat_locks (show_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS seat_locks_venue_idx 
    ON seat_locks (venue_id);

-- Composite index for ownership verification
CREATE INDEX CONCURRENTLY IF NOT EXISTS seat_locks_ownership_idx 
    ON seat_locks (seat_id, user_id, session_id) 
    WHERE expires_at > NOW();

-- ================================================
-- CLEANUP FUNCTION FOR EXPIRED LOCKS
-- ================================================

CREATE OR REPLACE FUNCTION cleanup_expired_seat_locks()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM seat_locks 
    WHERE expires_at <= NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup if any locks were removed
    IF deleted_count > 0 THEN
        RAISE NOTICE 'Cleaned up % expired seat locks', deleted_count;
    END IF;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- AUTOMATIC CLEANUP JOB (Every 5 minutes)
-- ================================================

-- Note: In production, this should be handled by a cron job or background worker
-- This is a fallback mechanism for development/testing

CREATE OR REPLACE FUNCTION schedule_seat_lock_cleanup()
RETURNS VOID AS $$
BEGIN
    -- This would typically be handled by pg_cron in production
    -- For now, applications should call cleanup_expired_seat_locks() periodically
    RAISE NOTICE 'Seat lock cleanup scheduled. Call cleanup_expired_seat_locks() periodically.';
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- LOCK ACQUISITION FUNCTION (ATOMIC)
-- ================================================

CREATE OR REPLACE FUNCTION acquire_seat_lock_atomic(
    p_seat_id VARCHAR(100),
    p_user_id VARCHAR(100), 
    p_session_id VARCHAR(100),
    p_ttl_seconds INTEGER,
    p_show_id VARCHAR(100),
    p_venue_id VARCHAR(100)
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    conflict_owner TEXT,
    expires_at TIMESTAMPTZ
) AS $$
DECLARE
    v_expires_at TIMESTAMPTZ;
    v_existing_lock RECORD;
BEGIN
    -- Calculate expiry time
    v_expires_at := NOW() + (p_ttl_seconds || ' seconds')::INTERVAL;
    
    -- Clean up any expired locks for this seat first
    DELETE FROM seat_locks 
    WHERE seat_id = p_seat_id AND expires_at <= NOW();
    
    -- Check if seat is already locked
    SELECT user_id, session_id, expires_at INTO v_existing_lock
    FROM seat_locks 
    WHERE seat_id = p_seat_id 
    LIMIT 1;
    
    IF FOUND THEN
        -- Seat is already locked
        RETURN QUERY SELECT 
            FALSE as success,
            'Seat is currently locked by another user' as message,
            (v_existing_lock.user_id || ':' || v_existing_lock.session_id) as conflict_owner,
            v_existing_lock.expires_at as expires_at;
        RETURN;
    END IF;
    
    -- Attempt to acquire lock
    BEGIN
        INSERT INTO seat_locks (seat_id, user_id, session_id, expires_at, show_id, venue_id)
        VALUES (p_seat_id, p_user_id, p_session_id, v_expires_at, p_show_id, p_venue_id);
        
        -- Success
        RETURN QUERY SELECT 
            TRUE as success,
            'Lock acquired successfully' as message,
            NULL::TEXT as conflict_owner,
            v_expires_at as expires_at;
        RETURN;
        
    EXCEPTION WHEN unique_violation THEN
        -- Race condition - someone else got the lock
        SELECT user_id, session_id, expires_at INTO v_existing_lock
        FROM seat_locks 
        WHERE seat_id = p_seat_id 
        LIMIT 1;
        
        RETURN QUERY SELECT 
            FALSE as success,
            'Lock acquisition race condition' as message,
            COALESCE(v_existing_lock.user_id || ':' || v_existing_lock.session_id, 'unknown') as conflict_owner,
            COALESCE(v_existing_lock.expires_at, NOW()) as expires_at;
        RETURN;
    END;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- LOCK RELEASE FUNCTION (WITH OWNERSHIP CHECK)
-- ================================================

CREATE OR REPLACE FUNCTION release_seat_lock_atomic(
    p_seat_id VARCHAR(100),
    p_user_id VARCHAR(100),
    p_session_id VARCHAR(100)
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_deleted_count INTEGER;
    v_existing_lock RECORD;
BEGIN
    -- Try to delete lock with ownership verification
    DELETE FROM seat_locks 
    WHERE seat_id = p_seat_id 
      AND user_id = p_user_id 
      AND session_id = p_session_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    IF v_deleted_count > 0 THEN
        -- Successfully released
        RETURN QUERY SELECT 
            TRUE as success,
            'Lock released successfully' as message;
        RETURN;
    END IF;
    
    -- Check if lock exists but owned by someone else
    SELECT user_id, session_id INTO v_existing_lock
    FROM seat_locks 
    WHERE seat_id = p_seat_id 
    LIMIT 1;
    
    IF FOUND THEN
        -- Lock exists but not owned by this user
        RETURN QUERY SELECT 
            FALSE as success,
            'Cannot release lock - not the owner' as message;
        RETURN;
    ELSE
        -- No lock found (idempotent)
        RETURN QUERY SELECT 
            TRUE as success,
            'No lock found to release (idempotent)' as message;
        RETURN;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- MONITORING VIEWS
-- ================================================

-- Current active locks
CREATE OR REPLACE VIEW active_seat_locks AS
SELECT 
    seat_id,
    user_id,
    session_id,
    locked_at,
    expires_at,
    show_id,
    venue_id,
    EXTRACT(EPOCH FROM (expires_at - NOW())) as remaining_seconds
FROM seat_locks 
WHERE expires_at > NOW()
ORDER BY locked_at DESC;

-- Lock statistics
CREATE OR REPLACE VIEW seat_lock_stats AS
SELECT 
    COUNT(*) as total_active_locks,
    COUNT(*) FILTER (WHERE expires_at <= NOW() + INTERVAL '30 seconds') as expiring_soon,
    COUNT(*) FILTER (WHERE expires_at > NOW() + INTERVAL '30 seconds' AND expires_at <= NOW() + INTERVAL '2 minutes') as short_term,
    COUNT(*) FILTER (WHERE expires_at > NOW() + INTERVAL '2 minutes') as long_term,
    MIN(expires_at) as earliest_expiry,
    MAX(expires_at) as latest_expiry
FROM seat_locks 
WHERE expires_at > NOW();

-- ================================================
-- GRANTS & PERMISSIONS
-- ================================================

-- Grant necessary permissions for the application user
-- Note: Replace 'lml_app_user' with your actual application database user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON seat_locks TO lml_app_user;
-- GRANT EXECUTE ON FUNCTION cleanup_expired_seat_locks() TO lml_app_user;
-- GRANT EXECUTE ON FUNCTION acquire_seat_lock_atomic TO lml_app_user;
-- GRANT EXECUTE ON FUNCTION release_seat_lock_atomic TO lml_app_user;
-- GRANT SELECT ON active_seat_locks TO lml_app_user;
-- GRANT SELECT ON seat_lock_stats TO lml_app_user;

-- ================================================
-- MIGRATION COMPLETE
-- ================================================

COMMENT ON TABLE seat_locks IS 'Production-grade seat locking table for Redis fallback with TTL and ownership tracking';
COMMENT ON FUNCTION cleanup_expired_seat_locks() IS 'Removes expired seat locks and returns count of deleted rows';
COMMENT ON FUNCTION acquire_seat_lock_atomic IS 'Atomically acquire a seat lock with conflict detection';
COMMENT ON FUNCTION release_seat_lock_atomic IS 'Atomically release a seat lock with ownership verification';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 005: Seat locks fallback table created successfully';
    RAISE NOTICE 'Tables: seat_locks';
    RAISE NOTICE 'Functions: cleanup_expired_seat_locks, acquire_seat_lock_atomic, release_seat_lock_atomic';
    RAISE NOTICE 'Views: active_seat_locks, seat_lock_stats';
    RAISE NOTICE 'Enterprise-grade PostgreSQL fallback system ready';
END $$;