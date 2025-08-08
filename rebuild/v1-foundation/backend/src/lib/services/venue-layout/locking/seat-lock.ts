/**
 * LML v1 Foundation - Enterprise Seat Locking System
 * ==================================================
 * Production-grade distributed locking with ownership tracking
 * Pattern: SET 'lock:seat:XYZ' 'user-123:session-456' NX PX
 * Created: 2025-08-05
 * Status: Phase 2B - Ticketmaster-Killer Architecture
 */

import { createClient } from 'redis';
import { getVenueLayoutServiceConfig } from '../config/service-config';
import { recordLockAcquisition, recordLockRelease, recordLockFailure, recordLockExpiry } from './lock-metrics';

// ================================================
// LOCK OWNERSHIP TYPES
// ================================================

export interface SeatLockOwnership {
  userId: string;
  sessionId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export interface SeatLockRequest {
  seatId: string;
  userId: string;
  sessionId: string;
  ttlMs?: number; // Optional TTL override
}

export interface SeatLockResult {
  success: boolean;
  ownership?: SeatLockOwnership;
  error?: string;
  conflictOwner?: string; // Who currently holds the lock
  retryAfterMs?: number;
}

export interface SeatLockStatus {
  isLocked: boolean;
  owner?: SeatLockOwnership;
  remainingTtlMs?: number;
}

// ================================================
// REDIS CLIENT MANAGEMENT
// ================================================

let redisClient: ReturnType<typeof createClient> | null = null;

async function getLockingRedisClient() {
  if (!redisClient) {
    const config = getVenueLayoutServiceConfig();
    
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL,
        database: 3, // Separate DB for locking (different from cache and rate limiting)
      });
      
      await redisClient.connect();
      console.log('✅ Seat Locking Redis connected (DB: 3)');
    } catch (error) {
      console.error('❌ Seat Locking Redis connection failed:', error);
      redisClient = null;
      throw new Error('Redis locking service unavailable');
    }
  }
  
  return redisClient;
}

// ================================================
// LOCK KEY UTILITIES
// ================================================

/**
 * Generate standardized lock key for a seat
 */
function getSeatLockKey(seatId: string): string {
  return `lml:lock:seat:${seatId}`;
}

/**
 * Generate ownership value for Redis storage
 */
function generateOwnershipValue(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

/**
 * Parse ownership value from Redis
 */
function parseOwnershipValue(value: string, acquiredAt: Date, expiresAt: Date): SeatLockOwnership {
  const [userId, sessionId] = value.split(':');
  return {
    userId,
    sessionId: sessionId || 'unknown',
    acquiredAt,
    expiresAt,
  };
}

// ================================================
// CORE LOCKING OPERATIONS
// ================================================

/**
 * Acquire a seat lock with ownership tracking
 * Uses Redis SET NX PX pattern for atomic lock acquisition
 */
export async function acquireSeatLock(request: SeatLockRequest): Promise<SeatLockResult> {
  const startTime = Date.now();
  
  try {
    const client = await getLockingRedisClient();
    const lockKey = getSeatLockKey(request.seatId);
    const ownershipValue = generateOwnershipValue(request.userId, request.sessionId);
    
    // Default TTL: 3 minutes (enough for seat selection + payment)
    const ttlMs = request.ttlMs || (3 * 60 * 1000);
    const acquiredAt = new Date();
    const expiresAt = new Date(Date.now() + ttlMs);
    
    // Atomic lock acquisition with TTL
    // SET key value NX PX ttl-milliseconds
    const result = await client.set(lockKey, ownershipValue, {
      NX: true, // Only set if key doesn't exist
      PX: ttlMs, // TTL in milliseconds
    });
    
    if (result === 'OK') {
      // Lock acquired successfully
      const ownership: SeatLockOwnership = {
        userId: request.userId,
        sessionId: request.sessionId,
        acquiredAt,
        expiresAt,
      };
      
      recordLockAcquisition(request.seatId, request.userId, ttlMs);
      
      console.log(`🔒 Seat lock acquired: ${request.seatId} by ${request.userId}:${request.sessionId} (expires: ${expiresAt.toISOString()})`);
      
      return {
        success: true,
        ownership,
      };
    } else {
      // Lock already held by someone else
      const currentOwner = await client.get(lockKey);
      const remainingTtl = await client.pTTL(lockKey);
      
      recordLockFailure(request.seatId, request.userId, 'already_locked');
      
      return {
        success: false,
        error: 'Seat is currently locked by another user',
        conflictOwner: currentOwner || 'unknown',
        retryAfterMs: remainingTtl > 0 ? remainingTtl : undefined,
      };
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    recordLockFailure(request.seatId, request.userId, 'redis_error');
    
    console.error(`❌ Seat lock acquisition failed for ${request.seatId}:`, error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown lock acquisition error',
    };
  }
}

/**
 * Release a seat lock with ownership validation
 * Only the lock owner can release their own lock
 */
export async function releaseSeatLock(
  seatId: string, 
  userId: string, 
  sessionId: string
): Promise<SeatLockResult> {
  try {
    const client = await getLockingRedisClient();
    const lockKey = getSeatLockKey(seatId);
    const expectedOwnership = generateOwnershipValue(userId, sessionId);
    
    // Get current lock value to verify ownership
    const currentOwner = await client.get(lockKey);
    
    if (!currentOwner) {
      return {
        success: true, // No lock to release (idempotent)
        error: 'No lock found for this seat',
      };
    }
    
    if (currentOwner !== expectedOwnership) {
      recordLockFailure(seatId, userId, 'ownership_mismatch');
      
      return {
        success: false,
        error: 'Cannot release lock - not the owner',
        conflictOwner: currentOwner,
      };
    }
    
    // Ownership verified - release the lock
    await client.del(lockKey);
    
    recordLockRelease(seatId, userId);
    
    console.log(`🔓 Seat lock released: ${seatId} by ${userId}:${sessionId}`);
    
    return {
      success: true,
    };
    
  } catch (error) {
    recordLockFailure(seatId, userId, 'redis_error');
    
    console.error(`❌ Seat lock release failed for ${seatId}:`, error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown lock release error',
    };
  }
}

/**
 * Check if a seat is locked and by whom
 */
export async function getSeatLockStatus(seatId: string): Promise<SeatLockStatus> {
  try {
    const client = await getLockingRedisClient();
    const lockKey = getSeatLockKey(seatId);
    
    const [ownershipValue, remainingTtl] = await Promise.all([
      client.get(lockKey),
      client.pTTL(lockKey)
    ]);
    
    if (!ownershipValue || remainingTtl <= 0) {
      return {
        isLocked: false,
      };
    }
    
    const acquiredAt = new Date(Date.now() - (3 * 60 * 1000) + remainingTtl); // Approximate
    const expiresAt = new Date(Date.now() + remainingTtl);
    
    return {
      isLocked: true,
      owner: parseOwnershipValue(ownershipValue, acquiredAt, expiresAt),
      remainingTtlMs: remainingTtl,
    };
    
  } catch (error) {
    console.error(`❌ Failed to check seat lock status for ${seatId}:`, error);
    return {
      isLocked: false, // Fail open - assume unlocked on error
    };
  }
}

/**
 * Extend the TTL of an existing lock (for payment processing)
 */
export async function extendSeatLockTTL(
  seatId: string,
  userId: string,
  sessionId: string,
  additionalTtlMs: number
): Promise<SeatLockResult> {
  try {
    const client = await getLockingRedisClient();
    const lockKey = getSeatLockKey(seatId);
    const expectedOwnership = generateOwnershipValue(userId, sessionId);
    
    // Verify ownership before extending
    const currentOwner = await client.get(lockKey);
    
    if (!currentOwner) {
      return {
        success: false,
        error: 'No lock found to extend',
      };
    }
    
    if (currentOwner !== expectedOwnership) {
      recordLockFailure(seatId, userId, 'ownership_mismatch');
      
      return {
        success: false,
        error: 'Cannot extend lock - not the owner',
        conflictOwner: currentOwner,
      };
    }
    
    // Extend the TTL
    const currentTtl = await client.pTTL(lockKey);
    const newTtl = Math.max(currentTtl, 0) + additionalTtlMs;
    
    await client.pExpire(lockKey, newTtl);
    
    console.log(`⏰ Seat lock extended: ${seatId} by ${additionalTtlMs}ms (new TTL: ${newTtl}ms)`);
    
    return {
      success: true,
      ownership: {
        userId,
        sessionId,
        acquiredAt: new Date(Date.now() - (3 * 60 * 1000) + currentTtl), // Approximate
        expiresAt: new Date(Date.now() + newTtl),
      },
    };
    
  } catch (error) {
    recordLockFailure(seatId, userId, 'redis_error');
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown lock extension error',
    };
  }
}

/**
 * Check if a specific user holds a lock on a seat
 */
export async function isLockHeldByUser(
  seatId: string,
  userId: string,
  sessionId: string
): Promise<boolean> {
  try {
    const client = await getLockingRedisClient();
    const lockKey = getSeatLockKey(seatId);
    const expectedOwnership = generateOwnershipValue(userId, sessionId);
    
    const currentOwner = await client.get(lockKey);
    
    return currentOwner === expectedOwnership;
    
  } catch (error) {
    console.error(`❌ Failed to check lock ownership for ${seatId}:`, error);
    return false; // Fail secure - assume not owned on error
  }
}

/**
 * Force release a lock (admin operation)
 */
export async function forceReleaseSeatLock(seatId: string, adminUserId: string): Promise<SeatLockResult> {
  try {
    const client = await getLockingRedisClient();
    const lockKey = getSeatLockKey(seatId);
    
    const currentOwner = await client.get(lockKey);
    
    if (!currentOwner) {
      return {
        success: true,
        error: 'No lock found to force release',
      };
    }
    
    await client.del(lockKey);
    
    console.log(`🔨 Seat lock force released: ${seatId} by admin ${adminUserId} (was: ${currentOwner})`);
    
    return {
      success: true,
    };
    
  } catch (error) {
    console.error(`❌ Force release failed for ${seatId}:`, error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown force release error',
    };
  }
}

// ================================================
// CLEANUP AND MONITORING
// ================================================

/**
 * Clean up expired locks (background job)
 */
export async function cleanupExpiredLocks(): Promise<number> {
  try {
    const client = await getLockingRedisClient();
    
    // Get all lock keys
    const lockKeys = await client.keys('lock:seat:*');
    let cleanedCount = 0;
    
    for (const key of lockKeys) {
      const ttl = await client.pTTL(key);
      
      if (ttl <= 0) {
        // Lock has expired
        await client.del(key);
        cleanedCount++;
        
        const seatId = key.replace('lock:seat:', '');
        recordLockExpiry(seatId);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired seat locks`);
    }
    
    return cleanedCount;
    
  } catch (error) {
    console.error('❌ Failed to cleanup expired locks:', error);
    return 0;
  }
}

/**
 * Get statistics about current locks
 */
export async function getLockStatistics(): Promise<{
  totalLocks: number;
  locksByTTL: {
    expiringSoon: number; // < 30 seconds
    shortTerm: number;    // 30s - 2min
    longTerm: number;     // > 2min
  };
}> {
  try {
    const client = await getLockingRedisClient();
    const lockKeys = await client.keys('lock:seat:*');
    
    let expiringSoon = 0;
    let shortTerm = 0;
    let longTerm = 0;
    
    for (const key of lockKeys) {
      const ttl = await client.pTTL(key);
      
      if (ttl <= 30000) {
        expiringSoon++;
      } else if (ttl <= 120000) {
        shortTerm++;
      } else {
        longTerm++;
      }
    }
    
    return {
      totalLocks: lockKeys.length,
      locksByTTL: {
        expiringSoon,
        shortTerm,
        longTerm,
      },
    };
    
  } catch (error) {
    console.error('❌ Failed to get lock statistics:', error);
    return {
      totalLocks: 0,
      locksByTTL: {
        expiringSoon: 0,
        shortTerm: 0,
        longTerm: 0,
      },
    };
  }
}

// ================================================
// GRACEFUL SHUTDOWN
// ================================================

/**
 * Graceful shutdown for locking service
 */
export async function shutdownSeatLocking(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ Seat Locking Redis disconnected gracefully');
    } catch (error) {
      console.error('Seat locking shutdown error:', error);
    }
  }
}