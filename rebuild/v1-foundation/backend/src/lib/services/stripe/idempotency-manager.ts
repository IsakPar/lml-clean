/**
 * Stripe Webhook Idempotency Manager
 * ==================================
 * 
 * Redis-based idempotency protection for Stripe webhooks
 * - TTL-based duplicate detection (24-hour window)
 * - Lock mechanism during processing  
 * - Response caching for identical requests
 * - SHA-256 based content hashing
 * 
 * Follows LML Redis service patterns with modular design
 */

import type { Redis } from 'ioredis';
import crypto from 'crypto';
import { REDIS_CONFIG } from '../redis/config/constants';

// ================================================
// CONFIGURATION
// ================================================

export const IDEMPOTENCY_CONFIG = {
  // TTL settings
  IDEMPOTENCY_TTL_SECONDS: 86400, // 24 hours
  PROCESSING_LOCK_TTL_SECONDS: 300, // 5 minutes max processing time
  
  // Key prefixes
  IDEMPOTENCY_KEY_PREFIX: 'stripe_idempotency',
  PROCESSING_LOCK_PREFIX: 'stripe_processing_lock',
  RESPONSE_CACHE_PREFIX: 'stripe_response_cache',
  
  // Limits
  MAX_PAYLOAD_SIZE_FOR_HASH: 1024 * 512, // 512KB max for hashing
  MAX_IDEMPOTENCY_KEYS_PER_HOUR: 10000,
} as const;

// ================================================
// TYPES
// ================================================

export interface IdempotencyKey {
  key: string;
  contentHash: string;
  timestamp: number;
}

export interface IdempotencyResult {
  isDuplicate: boolean;
  isProcessing: boolean;
  existingResponse?: any;
  lockAcquired: boolean;
  idempotencyKey: string;
}

export interface IdempotencyManagerConfig {
  redis: Redis;
  enableResponseCaching?: boolean;
  customTTL?: number;
}

// ================================================
// IDEMPOTENCY MANAGER CLASS
// ================================================

export class StripeIdempotencyManager {
  private redis: Redis;
  private enableResponseCaching: boolean;
  private customTTL: number;

  constructor(config: IdempotencyManagerConfig) {
    this.redis = config.redis;
    this.enableResponseCaching = config.enableResponseCaching ?? true;
    this.customTTL = config.customTTL ?? IDEMPOTENCY_CONFIG.IDEMPOTENCY_TTL_SECONDS;
  }

  // ================================================
  // PUBLIC METHODS
  // ================================================

  /**
   * Check if webhook event is duplicate and acquire processing lock
   */
  async checkIdempotencyAndLock(
    stripeEventId: string, 
    webhookPayload: any,
    requestTimestamp?: number
  ): Promise<IdempotencyResult> {
    const timestamp = requestTimestamp || Date.now();
    const idempotencyKey = this.generateIdempotencyKey(stripeEventId, webhookPayload, timestamp);
    
    try {
      // 1. Check if this exact event was already processed
      const existingResult = await this.checkExistingIdempotency(idempotencyKey);
      if (existingResult.isDuplicate) {
        return {
          ...existingResult,
          idempotencyKey,
          lockAcquired: false,
          isProcessing: false
        };
      }

      // 2. Check if event is currently being processed
      const processingCheck = await this.checkProcessingLock(stripeEventId);
      if (processingCheck.isProcessing) {
        return {
          isDuplicate: false,
          isProcessing: true,
          lockAcquired: false,
          idempotencyKey
        };
      }

      // 3. Acquire processing lock
      const lockAcquired = await this.acquireProcessingLock(stripeEventId, idempotencyKey);
      if (!lockAcquired) {
        // Race condition - another process acquired the lock
        return {
          isDuplicate: false,
          isProcessing: true,
          lockAcquired: false,
          idempotencyKey
        };
      }

      // 4. Store idempotency key
      await this.storeIdempotencyKey(idempotencyKey, stripeEventId, timestamp);

      return {
        isDuplicate: false,
        isProcessing: false,
        lockAcquired: true,
        idempotencyKey
      };

    } catch (error) {
      console.error('❌ Idempotency check failed:', error);
      throw new Error(`Idempotency check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Mark webhook processing as complete and optionally cache response
   */
  async markProcessingComplete(
    stripeEventId: string,
    idempotencyKey: string,
    response?: any
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      // 1. Release processing lock
      pipeline.del(this.getProcessingLockKey(stripeEventId));

      // 2. Mark idempotency key as processed
      pipeline.hset(
        this.getIdempotencyKey(idempotencyKey),
        'status', 'completed',
        'completed_at', Date.now().toString()
      );

      // 3. Cache response if enabled and provided
      if (this.enableResponseCaching && response) {
        pipeline.setex(
          this.getResponseCacheKey(idempotencyKey),
          this.customTTL,
          JSON.stringify(response)
        );
      }

      await pipeline.exec();

    } catch (error) {
      console.error('❌ Failed to mark processing complete:', error);
      throw error;
    }
  }

  /**
   * Mark webhook processing as failed and release lock
   */
  async markProcessingFailed(
    stripeEventId: string,
    idempotencyKey: string,
    error: Error
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      // 1. Release processing lock
      pipeline.del(this.getProcessingLockKey(stripeEventId));

      // 2. Mark idempotency key as failed
      pipeline.hset(
        this.getIdempotencyKey(idempotencyKey),
        'status', 'failed',
        'failed_at', Date.now().toString(),
        'error_message', error.message
      );

      await pipeline.exec();

    } catch (redisError) {
      console.error('❌ Failed to mark processing failed:', redisError);
      throw redisError;
    }
  }

  /**
   * Force release processing lock (for admin cleanup)
   */
  async forceReleaseLock(stripeEventId: string): Promise<boolean> {
    try {
      const result = await this.redis.del(this.getProcessingLockKey(stripeEventId));
      return result === 1;
    } catch (error) {
      console.error('❌ Failed to force release lock:', error);
      return false;
    }
  }

  /**
   * Get idempotency statistics
   */
  async getIdempotencyStats(): Promise<{
    totalKeys: number;
    processingLocks: number;
    completedEvents: number;
    failedEvents: number;
  }> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Count different types of keys
      pipeline.eval(`
        local idempotency_pattern = "${IDEMPOTENCY_CONFIG.IDEMPOTENCY_KEY_PREFIX}:*"
        local processing_pattern = "${IDEMPOTENCY_CONFIG.PROCESSING_LOCK_PREFIX}:*"
        
        local idempotency_keys = redis.call('SCAN', 0, 'MATCH', idempotency_pattern, 'COUNT', 1000)
        local processing_keys = redis.call('SCAN', 0, 'MATCH', processing_pattern, 'COUNT', 1000)
        
        return {
          #idempotency_keys[2],
          #processing_keys[2]
        }
      `, 0);

      const results = await pipeline.exec();
      const [scanResult] = results!;
      const [totalKeys, processingLocks] = scanResult[1] as number[];

      return {
        totalKeys,
        processingLocks,
        completedEvents: 0, // TODO: Could be calculated with additional scan
        failedEvents: 0,    // TODO: Could be calculated with additional scan
      };

    } catch (error) {
      console.error('❌ Failed to get idempotency stats:', error);
      return {
        totalKeys: 0,
        processingLocks: 0,
        completedEvents: 0,
        failedEvents: 0,
      };
    }
  }

  // ================================================
  // PRIVATE METHODS
  // ================================================

  /**
   * Generate deterministic idempotency key from event content
   */
  private generateIdempotencyKey(
    stripeEventId: string, 
    payload: any, 
    timestamp: number
  ): string {
    // Create content hash from payload (excluding timestamp fields)
    const sanitizedPayload = this.sanitizePayloadForHashing(payload);
    const contentString = JSON.stringify(sanitizedPayload);
    const contentHash = crypto
      .createHash('sha256')
      .update(contentString)
      .digest('hex')
      .substring(0, 16); // First 16 chars for brevity

    // Combine event ID and content hash for unique key
    return `${stripeEventId}_${contentHash}_${timestamp}`;
  }

  /**
   * Remove timestamp fields that could cause hash differences
   */
  private sanitizePayloadForHashing(payload: any): any {
    const sanitized = { ...payload };
    
    // Remove fields that change between identical requests
    delete sanitized.created;
    delete sanitized.request?.id;
    
    // Sort object keys for consistent hashing
    return this.sortObjectKeys(sanitized);
  }

  /**
   * Recursively sort object keys for consistent hashing
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    
    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = this.sortObjectKeys(obj[key]);
        return sorted;
      }, {} as any);
  }

  /**
   * Check if idempotency key already exists
   */
  private async checkExistingIdempotency(idempotencyKey: string): Promise<{
    isDuplicate: boolean;
    existingResponse?: any;
  }> {
    const key = this.getIdempotencyKey(idempotencyKey);
    const exists = await this.redis.exists(key);
    
    if (!exists) {
      return { isDuplicate: false };
    }

    // Check if we have cached response
    if (this.enableResponseCaching) {
      const cachedResponse = await this.redis.get(this.getResponseCacheKey(idempotencyKey));
      if (cachedResponse) {
        return {
          isDuplicate: true,
          existingResponse: JSON.parse(cachedResponse)
        };
      }
    }

    return { isDuplicate: true };
  }

  /**
   * Check if event is currently being processed
   */
  private async checkProcessingLock(stripeEventId: string): Promise<{ isProcessing: boolean }> {
    const lockKey = this.getProcessingLockKey(stripeEventId);
    const isLocked = await this.redis.exists(lockKey);
    return { isProcessing: isLocked === 1 };
  }

  /**
   * Acquire processing lock with TTL
   */
  private async acquireProcessingLock(stripeEventId: string, idempotencyKey: string): Promise<boolean> {
    const lockKey = this.getProcessingLockKey(stripeEventId);
    const lockValue = `${idempotencyKey}_${Date.now()}`;
    
    // Use SET NX EX for atomic lock acquisition
    const result = await this.redis.set(
      lockKey,
      lockValue,
      'EX',
      IDEMPOTENCY_CONFIG.PROCESSING_LOCK_TTL_SECONDS,
      'NX'
    );
    
    return result === 'OK';
  }

  /**
   * Store idempotency key with metadata
   */
  private async storeIdempotencyKey(
    idempotencyKey: string,
    stripeEventId: string,
    timestamp: number
  ): Promise<void> {
    const key = this.getIdempotencyKey(idempotencyKey);
    
    await this.redis.hmset(
      key,
      'stripe_event_id', stripeEventId,
      'created_at', timestamp.toString(),
      'status', 'processing'
    );
    
    // Set TTL for automatic cleanup
    await this.redis.expire(key, this.customTTL);
  }

  // ================================================
  // KEY GENERATION HELPERS
  // ================================================

  private getIdempotencyKey(idempotencyKey: string): string {
    return `${IDEMPOTENCY_CONFIG.IDEMPOTENCY_KEY_PREFIX}:${idempotencyKey}`;
  }

  private getProcessingLockKey(stripeEventId: string): string {
    return `${IDEMPOTENCY_CONFIG.PROCESSING_LOCK_PREFIX}:${stripeEventId}`;
  }

  private getResponseCacheKey(idempotencyKey: string): string {
    return `${IDEMPOTENCY_CONFIG.RESPONSE_CACHE_PREFIX}:${idempotencyKey}`;
  }
}

// ================================================
// FACTORY FUNCTION
// ================================================

/**
 * Create idempotency manager with Redis connection
 */
export function createStripeIdempotencyManager(
  redis: Redis,
  options?: Partial<IdempotencyManagerConfig>
): StripeIdempotencyManager {
  return new StripeIdempotencyManager({
    redis,
    ...options
  });
}