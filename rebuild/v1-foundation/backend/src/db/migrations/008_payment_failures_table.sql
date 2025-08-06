-- Migration 008: Payment Failures Table
-- 
-- Creates the payment_failures table for error tracking, rollback management,
-- and analytics around payment failures and recovery operations
--
-- Author: LML Backend System
-- Date: 2025-01-14

-- =====================================
-- PAYMENT FAILURES TABLE
-- =====================================

CREATE TABLE payment_failures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Associated booking and payment intent
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    stripe_payment_intent_id VARCHAR(255),
    stripe_event_id VARCHAR(255),
    
    -- Failure classification
    failure_type VARCHAR(20) NOT NULL CHECK (failure_type IN ('soft', 'hard', 'fsm_transition_failed', 'rollback_required')),
    failure_reason VARCHAR(100) NOT NULL,
    error_code VARCHAR(50),
    decline_code VARCHAR(50),
    error_message TEXT,
    
    -- Recovery and retry management
    retryable BOOLEAN DEFAULT false,
    recovery_required BOOLEAN DEFAULT false,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    
    -- Business logic flags
    seats_released BOOLEAN DEFAULT false,
    notification_sent BOOLEAN DEFAULT false,
    
    -- Financial details
    amount_cents INTEGER,
    currency VARCHAR(3),
    
    -- Metadata and context
    failure_metadata JSONB DEFAULT '{}',
    recovery_metadata JSONB DEFAULT '{}',
    
    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processing', 'resolved', 'failed', 'abandoned')
    ),
    
    -- Audit timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    scheduled_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT positive_amount CHECK (amount_cents IS NULL OR amount_cents > 0),
    CONSTRAINT valid_currency CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0),
    CONSTRAINT valid_max_retries CHECK (max_retries >= 0)
);

-- =====================================
-- INDEXES FOR PERFORMANCE
-- =====================================

-- Primary lookup by booking ID
CREATE INDEX idx_payment_failures_booking_id 
ON payment_failures(booking_id);

-- Lookup by Stripe payment intent
CREATE INDEX idx_payment_failures_stripe_payment_intent 
ON payment_failures(stripe_payment_intent_id);

-- Lookup by Stripe event ID (for idempotency)
CREATE INDEX idx_payment_failures_stripe_event 
ON payment_failures(stripe_event_id);

-- Query by failure type for analytics
CREATE INDEX idx_payment_failures_type_reason 
ON payment_failures(failure_type, failure_reason);

-- Query pending recovery operations
CREATE INDEX idx_payment_failures_recovery_required 
ON payment_failures(recovery_required, processing_status, scheduled_at) 
WHERE recovery_required = true AND processing_status IN ('pending', 'processing');

-- Query failures needing retry
CREATE INDEX idx_payment_failures_retry 
ON payment_failures(retryable, retry_count, next_retry_at, processing_status)
WHERE retryable = true AND processing_status = 'pending';

-- Query by processing status
CREATE INDEX idx_payment_failures_processing_status 
ON payment_failures(processing_status, created_at DESC);

-- Time-based queries for analytics
CREATE INDEX idx_payment_failures_created_at 
ON payment_failures(created_at DESC);

-- Composite index for failure analytics
CREATE INDEX idx_payment_failures_analytics 
ON payment_failures(failure_type, failure_reason, created_at, amount_cents)
WHERE processing_status = 'resolved';

-- =====================================
-- AUTOMATIC UPDATED_AT TRIGGER
-- =====================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_failures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on every update
CREATE TRIGGER trigger_payment_failures_updated_at
    BEFORE UPDATE ON payment_failures
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_failures_updated_at();

-- =====================================
-- PAYMENT FAILURE ANALYTICS VIEW
-- =====================================

-- Create a view for payment failure analytics
CREATE VIEW payment_failure_analytics AS
SELECT 
    failure_type,
    failure_reason,
    error_code,
    decline_code,
    retryable,
    COUNT(*) as failure_count,
    COUNT(*) FILTER (WHERE processing_status = 'resolved') as resolved_count,
    COUNT(*) FILTER (WHERE seats_released = true) as seats_released_count,
    AVG(amount_cents) as avg_amount_cents,
    SUM(amount_cents) as total_amount_cents,
    AVG(retry_count) as avg_retry_count,
    MIN(created_at) as first_failure_at,
    MAX(created_at) as last_failure_at,
    -- Calculate resolution rate
    CASE 
        WHEN COUNT(*) > 0 THEN 
            (COUNT(*) FILTER (WHERE processing_status = 'resolved')::FLOAT / COUNT(*) * 100)
        ELSE 0 
    END as resolution_rate_percent
FROM payment_failures
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY failure_type, failure_reason, error_code, decline_code, retryable
ORDER BY failure_count DESC;

-- =====================================
-- UTILITY FUNCTIONS
-- =====================================

-- Function to schedule payment failure retry
CREATE OR REPLACE FUNCTION schedule_payment_failure_retry(
    failure_id UUID,
    retry_delay_minutes INTEGER DEFAULT 30
)
RETURNS BOOLEAN AS $$
DECLARE
    current_retry_count INTEGER;
    max_retry_limit INTEGER;
BEGIN
    -- Get current retry count and max retries
    SELECT retry_count, max_retries 
    INTO current_retry_count, max_retry_limit
    FROM payment_failures 
    WHERE id = failure_id AND retryable = true;
    
    -- Check if we can retry
    IF current_retry_count IS NULL OR current_retry_count >= max_retry_limit THEN
        -- Update status to abandoned
        UPDATE payment_failures 
        SET processing_status = 'abandoned', updated_at = NOW()
        WHERE id = failure_id;
        RETURN false;
    END IF;
    
    -- Schedule the retry
    UPDATE payment_failures 
    SET 
        retry_count = retry_count + 1,
        next_retry_at = NOW() + (retry_delay_minutes || ' minutes')::INTERVAL,
        processing_status = 'pending',
        updated_at = NOW()
    WHERE id = failure_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to mark payment failure as resolved
CREATE OR REPLACE FUNCTION resolve_payment_failure(
    failure_id UUID,
    resolution_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE payment_failures 
    SET 
        processing_status = 'resolved',
        resolved_at = NOW(),
        recovery_metadata = COALESCE(recovery_metadata, '{}'::JSONB) || resolution_metadata,
        updated_at = NOW()
    WHERE id = failure_id 
      AND processing_status IN ('pending', 'processing', 'failed');
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function for payment failure cleanup (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_payment_failures(retention_days INTEGER DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete resolved payment failures older than retention period
    DELETE FROM payment_failures 
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
    AND processing_status = 'resolved';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    RAISE NOTICE 'Cleaned up % resolved payment failures older than % days', deleted_count, retention_days;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- SECURITY POLICIES (ROW LEVEL SECURITY)
-- =====================================

-- Enable RLS on payment failures table
ALTER TABLE payment_failures ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all access to payment failures (since this is internal system table)
-- In production, you might want more restrictive policies based on application roles
CREATE POLICY payment_failures_full_access ON payment_failures
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

-- =====================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================

COMMENT ON TABLE payment_failures IS 'Tracks payment failures, retry logic, and recovery operations for comprehensive error handling and analytics';
COMMENT ON COLUMN payment_failures.failure_type IS 'Classification: soft (retryable), hard (terminal), fsm_transition_failed, rollback_required';
COMMENT ON COLUMN payment_failures.failure_reason IS 'Specific reason code from Stripe or internal system';
COMMENT ON COLUMN payment_failures.retryable IS 'Whether this failure type allows user retry';
COMMENT ON COLUMN payment_failures.recovery_required IS 'Whether system recovery/rollback is needed';
COMMENT ON COLUMN payment_failures.seats_released IS 'Whether seat locks were released due to this failure';
COMMENT ON COLUMN payment_failures.failure_metadata IS 'Full context and Stripe error details';
COMMENT ON COLUMN payment_failures.recovery_metadata IS 'Recovery operation details and results';

-- =====================================
-- MIGRATION COMPLETE
-- =====================================

-- Insert migration record
INSERT INTO schema_migrations (version, applied_at) 
VALUES ('008_payment_failures_table', NOW())
ON CONFLICT (version) DO NOTHING;