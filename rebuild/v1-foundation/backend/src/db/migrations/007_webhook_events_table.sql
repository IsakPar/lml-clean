-- Migration 007: Stripe Webhook Events Table
-- 
-- Creates the webhook_events table for idempotency protection,
-- replay attack prevention, and audit logging of all Stripe webhook events
--
-- Author: LML Backend System
-- Date: 2025-01-14

-- =====================================
-- WEBHOOK EVENTS TABLE
-- =====================================

CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Stripe event identification
    stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    livemode BOOLEAN NOT NULL DEFAULT false,
    api_version VARCHAR(20),
    
    -- Processing status and timing
    processing_status VARCHAR(20) DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processing', 'completed', 'failed', 'retrying')
    ),
    processed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    
    -- Idempotency and deduplication
    idempotency_key VARCHAR(255),
    
    -- Full webhook payload for debugging and replay
    raw_payload JSONB NOT NULL,
    
    -- Audit timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_retry_count CHECK (retry_count >= 0),
    CONSTRAINT valid_event_id CHECK (stripe_event_id ~ '^evt_[a-zA-Z0-9]+$'),
    CONSTRAINT processing_time_logic CHECK (
        (processing_status IN ('completed', 'failed') AND processed_at IS NOT NULL) OR
        (processing_status IN ('pending', 'processing', 'retrying') AND processed_at IS NULL)
    )
);

-- =====================================
-- INDEXES FOR PERFORMANCE
-- =====================================

-- Primary lookup by Stripe event ID (for idempotency checks)
CREATE UNIQUE INDEX idx_webhook_events_stripe_event_id 
ON webhook_events(stripe_event_id);

-- Query by event type for analytics and debugging
CREATE INDEX idx_webhook_events_event_type 
ON webhook_events(event_type);

-- Query by processing status for retry logic
CREATE INDEX idx_webhook_events_processing_status 
ON webhook_events(processing_status);

-- Query by creation time for cleanup and analytics
CREATE INDEX idx_webhook_events_created_at 
ON webhook_events(created_at DESC);

-- Query unprocessed events for retry system
CREATE INDEX idx_webhook_events_unprocessed 
ON webhook_events(processing_status, created_at) 
WHERE processing_status IN ('pending', 'failed', 'retrying');

-- Query by livemode for environment separation
CREATE INDEX idx_webhook_events_livemode 
ON webhook_events(livemode);

-- =====================================
-- AUTOMATIC UPDATED_AT TRIGGER
-- =====================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on every update
CREATE TRIGGER trigger_webhook_events_updated_at
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_events_updated_at();

-- =====================================
-- WEBHOOK EVENT STATISTICS VIEW
-- =====================================

-- Create a view for webhook processing analytics
CREATE VIEW webhook_event_stats AS
SELECT 
    event_type,
    livemode,
    processing_status,
    COUNT(*) as event_count,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds,
    MIN(created_at) as first_event_at,
    MAX(created_at) as last_event_at,
    SUM(retry_count) as total_retries
FROM webhook_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY event_type, livemode, processing_status
ORDER BY event_count DESC;

-- =====================================
-- DATA RETENTION POLICY
-- =====================================

-- Create function for webhook event cleanup (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete webhook events older than retention period
    -- Keep failed events for longer debugging
    DELETE FROM webhook_events 
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
    AND processing_status = 'completed';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    RAISE NOTICE 'Cleaned up % completed webhook events older than % days', deleted_count, retention_days;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- SECURITY POLICIES (ROW LEVEL SECURITY)
-- =====================================

-- Enable RLS on webhook events table
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all access to webhook events (since this is internal system table)
-- In production, you might want more restrictive policies based on application roles
CREATE POLICY webhook_events_full_access ON webhook_events
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

-- =====================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================

COMMENT ON TABLE webhook_events IS 'Stores all Stripe webhook events for idempotency protection, replay attack prevention, and audit logging';
COMMENT ON COLUMN webhook_events.stripe_event_id IS 'Unique Stripe event ID (evt_...) for idempotency checking';
COMMENT ON COLUMN webhook_events.event_type IS 'Stripe event type (e.g., payment_intent.succeeded)';
COMMENT ON COLUMN webhook_events.processing_status IS 'Current processing status of the webhook event';
COMMENT ON COLUMN webhook_events.retry_count IS 'Number of times processing was retried for this event';
COMMENT ON COLUMN webhook_events.raw_payload IS 'Complete webhook payload from Stripe for debugging and replay';
COMMENT ON COLUMN webhook_events.idempotency_key IS 'Stripe idempotency key if provided in the webhook request';

-- =====================================
-- MIGRATION COMPLETE
-- =====================================

-- Insert migration record
INSERT INTO schema_migrations (version, applied_at) 
VALUES ('007_webhook_events_table', NOW())
ON CONFLICT (version) DO NOTHING;