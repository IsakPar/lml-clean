/**
 * Stripe Event Deduplication Service
 * ==================================
 * 
 * PostgreSQL-based event deduplication with race condition handling
 * - UPSERT operations for atomic duplicate checking
 * - Integration with webhook_events table
 * - Handles concurrent webhook processing
 * 
 * Works in conjunction with Redis idempotency manager for comprehensive
 * duplicate protection at both Redis (fast) and PostgreSQL (durable) layers
 */

import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

// ================================================
// CONFIGURATION
// ================================================

export const DEDUPLICATION_CONFIG = {
  // Processing timeouts
  MAX_PROCESSING_TIME_SECONDS: 300, // 5 minutes
  STALE_EVENT_CLEANUP_HOURS: 24,
  
  // Retry settings
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 100,
} as const;

// ================================================
// TYPES
// ================================================

export interface WebhookEventRecord {
  id?: string;
  stripeEventId: string;
  eventType: string;
  livemode: boolean;
  apiVersion: string;
  idempotencyKey?: string;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  retryCount: number;
  rawPayload: any;
}

export interface DeduplicationResult {
  isNew: boolean;
  isDuplicate: boolean;
  isProcessing: boolean;
  canProcess: boolean;
  existingRecord?: WebhookEventRecord;
  recordId?: string;
}

export interface EventDeduplicatorConfig {
  postgres: Pool;
  enableCleanup?: boolean;
}

// ================================================
// VALIDATION SCHEMAS
// ================================================

const webhookEventSchema = z.object({
  stripeEventId: z.string().min(1),
  eventType: z.string().min(1),
  livemode: z.boolean(),
  apiVersion: z.string().min(1),
  idempotencyKey: z.string().optional(),
  rawPayload: z.any(),
});

// ================================================
// EVENT DEDUPLICATOR CLASS
// ================================================

export class StripeEventDeduplicator {
  private postgres: Pool;
  private enableCleanup: boolean;

  constructor(config: EventDeduplicatorConfig) {
    this.postgres = config.postgres;
    this.enableCleanup = config.enableCleanup ?? true;
  }

  // ================================================
  // PUBLIC METHODS
  // ================================================

  /**
   * Check for duplicate events and register new event atomically
   */
  async checkAndRegisterEvent(
    eventData: Omit<WebhookEventRecord, 'id' | 'processingStatus' | 'retryCount'>
  ): Promise<DeduplicationResult> {
    const validated = webhookEventSchema.parse(eventData);
    
    const client = await this.postgres.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Check if event already exists
      const existingCheck = await this.findExistingEvent(client, validated.stripeEventId);
      
      if (existingCheck.exists) {
        await client.query('COMMIT');
        
        return {
          isNew: false,
          isDuplicate: true,
          isProcessing: existingCheck.record!.processingStatus === 'processing',
          canProcess: false,
          existingRecord: existingCheck.record,
          recordId: existingCheck.record!.id
        };
      }

      // 2. Insert new event record with processing status
      const insertResult = await this.insertNewEvent(client, {
        stripeEventId: validated.stripeEventId,
        eventType: validated.eventType,
        livemode: validated.livemode,
        apiVersion: validated.apiVersion,
        idempotencyKey: validated.idempotencyKey,
        rawPayload: validated.rawPayload,
        processingStatus: 'processing' as const,
        retryCount: 0
      });

      await client.query('COMMIT');

      return {
        isNew: true,
        isDuplicate: false,
        isProcessing: true, // We just set it to processing
        canProcess: true,
        recordId: insertResult.recordId
      };

    } catch (error) {
      await client.query('ROLLBACK');
      
      // Check if this was a unique constraint violation (race condition)
      if (this.isUniqueConstraintViolation(error)) {
        // Another process inserted the same event concurrently
        const existingEvent = await this.findExistingEvent(client, validated.stripeEventId);
        
        return {
          isNew: false,
          isDuplicate: true,
          isProcessing: existingEvent.record?.processingStatus === 'processing',
          canProcess: false,
          existingRecord: existingEvent.record,
          recordId: existingEvent.record?.id
        };
      }
      
      console.error('❌ Event deduplication error:', error);
      throw new Error(`Event deduplication failed: ${error instanceof Error ? error.message : String(error)}`);
      
    } finally {
      client.release();
    }
  }

  /**
   * Update event processing status
   */
  async updateEventStatus(
    recordId: string,
    status: 'completed' | 'failed' | 'retrying',
    error?: Error
  ): Promise<void> {
    const client = await this.postgres.connect();
    
    try {
      const updateQuery = `
        UPDATE webhook_events 
        SET 
          processing_status = $1,
          processed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE processed_at END,
          retry_count = CASE WHEN $1 = 'retrying' THEN retry_count + 1 ELSE retry_count END,
          updated_at = NOW()
        WHERE id = $2
      `;
      
      await client.query(updateQuery, [status, recordId]);
      
      // If failed, optionally log error details
      if (status === 'failed' && error) {
        await client.query(`
          UPDATE webhook_events 
          SET raw_payload = jsonb_set(
            raw_payload, 
            '{processing_error}', 
            to_jsonb($1::text)
          )
          WHERE id = $2
        `, [error.message, recordId]);
      }
      
    } catch (updateError) {
      console.error('❌ Failed to update event status:', updateError);
      throw updateError;
    } finally {
      client.release();
    }
  }

  /**
   * Get event processing statistics
   */
  async getProcessingStats(hours: number = 24): Promise<{
    totalEvents: number;
    pendingEvents: number;
    processingEvents: number;
    completedEvents: number;
    failedEvents: number;
    retryingEvents: number;
    avgProcessingTimeMs: number;
  }> {
    const client = await this.postgres.connect();
    
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE processing_status = 'pending') as pending_events,
          COUNT(*) FILTER (WHERE processing_status = 'processing') as processing_events,
          COUNT(*) FILTER (WHERE processing_status = 'completed') as completed_events,
          COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_events,
          COUNT(*) FILTER (WHERE processing_status = 'retrying') as retrying_events,
          AVG(
            EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000
          ) FILTER (WHERE processed_at IS NOT NULL) as avg_processing_time_ms
        FROM webhook_events 
        WHERE created_at >= NOW() - INTERVAL '${hours} hours'
      `;
      
      const result = await client.query(statsQuery);
      const stats = result.rows[0];
      
      return {
        totalEvents: parseInt(stats.total_events) || 0,
        pendingEvents: parseInt(stats.pending_events) || 0,
        processingEvents: parseInt(stats.processing_events) || 0,
        completedEvents: parseInt(stats.completed_events) || 0,
        failedEvents: parseInt(stats.failed_events) || 0,
        retryingEvents: parseInt(stats.retrying_events) || 0,
        avgProcessingTimeMs: parseFloat(stats.avg_processing_time_ms) || 0,
      };
      
    } catch (error) {
      console.error('❌ Failed to get processing stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find stale processing events (for cleanup/recovery)
   */
  async findStaleProcessingEvents(maxAgeMinutes: number = 10): Promise<WebhookEventRecord[]> {
    const client = await this.postgres.connect();
    
    try {
      const staleQuery = `
        SELECT 
          id, stripe_event_id, event_type, livemode, api_version,
          idempotency_key, processing_status, retry_count, raw_payload
        FROM webhook_events
        WHERE processing_status = 'processing'
          AND created_at < NOW() - INTERVAL '${maxAgeMinutes} minutes'
        ORDER BY created_at ASC
        LIMIT 100
      `;
      
      const result = await client.query(staleQuery);
      
      return result.rows.map(row => ({
        id: row.id,
        stripeEventId: row.stripe_event_id,
        eventType: row.event_type,
        livemode: row.livemode,
        apiVersion: row.api_version,
        idempotencyKey: row.idempotency_key,
        processingStatus: row.processing_status,
        retryCount: row.retry_count,
        rawPayload: row.raw_payload,
      }));
      
    } catch (error) {
      console.error('❌ Failed to find stale events:', error);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Cleanup old completed events (retention policy)
   */
  async cleanupOldEvents(retentionDays: number = 90): Promise<number> {
    if (!this.enableCleanup) {
      return 0;
    }
    
    const client = await this.postgres.connect();
    
    try {
      const cleanupQuery = `
        DELETE FROM webhook_events 
        WHERE processing_status = 'completed'
          AND created_at < NOW() - INTERVAL '${retentionDays} days'
      `;
      
      const result = await client.query(cleanupQuery);
      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old webhook events`);
      }
      
      return deletedCount;
      
    } catch (error) {
      console.error('❌ Failed to cleanup old events:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  // ================================================
  // PRIVATE METHODS
  // ================================================

  /**
   * Find existing event by Stripe event ID
   */
  private async findExistingEvent(
    client: PoolClient,
    stripeEventId: string
  ): Promise<{ exists: boolean; record?: WebhookEventRecord }> {
    const query = `
      SELECT 
        id, stripe_event_id, event_type, livemode, api_version,
        idempotency_key, processing_status, retry_count, raw_payload
      FROM webhook_events 
      WHERE stripe_event_id = $1
    `;
    
    const result = await client.query(query, [stripeEventId]);
    
    if (result.rows.length === 0) {
      return { exists: false };
    }
    
    const row = result.rows[0];
    return {
      exists: true,
      record: {
        id: row.id,
        stripeEventId: row.stripe_event_id,
        eventType: row.event_type,
        livemode: row.livemode,
        apiVersion: row.api_version,
        idempotencyKey: row.idempotency_key,
        processingStatus: row.processing_status,
        retryCount: row.retry_count,
        rawPayload: row.raw_payload,
      }
    };
  }

  /**
   * Insert new event record
   */
  private async insertNewEvent(
    client: PoolClient,
    eventData: WebhookEventRecord
  ): Promise<{ recordId: string }> {
    const insertQuery = `
      INSERT INTO webhook_events (
        stripe_event_id, event_type, livemode, api_version,
        idempotency_key, processing_status, retry_count, raw_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    
    const values = [
      eventData.stripeEventId,
      eventData.eventType,
      eventData.livemode,
      eventData.apiVersion,
      eventData.idempotencyKey,
      eventData.processingStatus,
      eventData.retryCount,
      JSON.stringify(eventData.rawPayload)
    ];
    
    const result = await client.query(insertQuery, values);
    return { recordId: result.rows[0].id };
  }

  /**
   * Check if error is a unique constraint violation
   */
  private isUniqueConstraintViolation(error: any): boolean {
    return (
      error.code === '23505' || // PostgreSQL unique violation
      (error.message && error.message.includes('duplicate key'))
    );
  }
}

// ================================================
// FACTORY FUNCTION
// ================================================

/**
 * Create event deduplicator with PostgreSQL connection
 */
export function createStripeEventDeduplicator(
  postgres: Pool,
  options?: Partial<EventDeduplicatorConfig>
): StripeEventDeduplicator {
  return new StripeEventDeduplicator({
    postgres,
    ...options
  });
}