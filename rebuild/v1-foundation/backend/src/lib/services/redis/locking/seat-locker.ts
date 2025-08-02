/**
 * LML v1 Foundation - Seat Locker
 * ================================
 * Pure seat locking operations (no side effects)
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';
import { generateLockId, generateSeatLockKey, parseLockId } from '../utils/key-generator';
import { REDIS_CONFIG } from '../config/constants';

// ================================================
// LOCKING INTERFACES
// ================================================

export interface LockSeatOptions {
  seatId: string;
  userId: string;
  showId: string;
  ttlSeconds?: number;
}

export interface LockSeatResult {
  success: boolean;
  lockId?: string;
  error?: string;
  errorCode?: LockErrorCode;
}

export interface ReleaseSeatOptions {
  seatId: string;
  userId: string;
  showId: string;
  lockId?: string;
  verifyOwnership?: boolean;
}

export interface ReleaseSeatResult {
  success: boolean;
  error?: string;
  errorCode?: ReleaseErrorCode;
}

export type LockErrorCode = 
  | 'SEAT_ALREADY_LOCKED'
  | 'INVALID_TTL'
  | 'REDIS_ERROR'
  | 'UNKNOWN_ERROR';

export type ReleaseErrorCode = 
  | 'LOCK_NOT_FOUND'
  | 'LOCK_NOT_OWNED'
  | 'REDIS_ERROR'
  | 'UNKNOWN_ERROR';

// ================================================
// SEAT LOCKING OPERATIONS
// ================================================

/**
 * Lock a seat for a specific user with TTL (pure operation)
 */
export async function lockSeat(
  client: Redis,
  options: LockSeatOptions
): Promise<LockSeatResult> {
  const {
    seatId,
    userId,
    showId,
    ttlSeconds = REDIS_CONFIG.DEFAULT_LOCK_TTL_SECONDS
  } = options;

  try {
    // Validate TTL
    if (ttlSeconds <= 0 || ttlSeconds > REDIS_CONFIG.MAX_LOCK_TTL_SECONDS) {
      return {
        success: false,
        error: `Invalid TTL: must be between 1 and ${REDIS_CONFIG.MAX_LOCK_TTL_SECONDS} seconds`,
        errorCode: 'INVALID_TTL'
      };
    }

    // Generate unique lock ID and key
    const lockId = generateLockId(userId);
    const lockKey = generateSeatLockKey(showId, seatId);

    // Atomic lock operation using SET NX EX
    const result = await client.set(
      lockKey,
      lockId,
      'EX', ttlSeconds,  // Expire after TTL
      'NX'              // Only set if not exists
    );

    if (result === 'OK') {
      return {
        success: true,
        lockId
      };
    } else {
      // Lock already exists - check who owns it
      const existingLock = await client.get(lockKey);
      const isOwnLock = existingLock === lockId;

      return {
        success: false,
        error: isOwnLock ? 'Seat already locked by this user' : 'Seat locked by another user',
        errorCode: 'SEAT_ALREADY_LOCKED'
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during seat lock',
      errorCode: 'REDIS_ERROR'
    };
  }
}

/**
 * Release a seat lock (pure operation)
 */
export async function releaseSeat(
  client: Redis,
  options: ReleaseSeatOptions
): Promise<ReleaseSeatResult> {
  const {
    seatId,
    userId,
    showId,
    lockId,
    verifyOwnership = true
  } = options;

  try {
    const lockKey = generateSeatLockKey(showId, seatId);

    // If ownership verification is requested and lockId provided
    if (verifyOwnership && lockId) {
      const currentLock = await client.get(lockKey);
      
      if (!currentLock) {
        return {
          success: false,
          error: 'Lock not found',
          errorCode: 'LOCK_NOT_FOUND'
        };
      }

      if (currentLock !== lockId) {
        return {
          success: false,
          error: 'Lock not owned by this user',
          errorCode: 'LOCK_NOT_OWNED'
        };
      }
    }

    // Release the lock
    const result = await client.del(lockKey);

    if (result === 1) {
      return { success: true };
    } else {
      return {
        success: false,
        error: 'Lock not found or already released',
        errorCode: 'LOCK_NOT_FOUND'
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during seat release',
      errorCode: 'REDIS_ERROR'
    };
  }
}

// ================================================
// BATCH LOCKING OPERATIONS
// ================================================

export interface BatchLockOptions {
  seats: Array<{ seatId: string; showId: string }>;
  userId: string;
  ttlSeconds?: number;
}

export interface BatchLockResult {
  successCount: number;
  failureCount: number;
  results: Array<{
    seatId: string;
    showId: string;
    success: boolean;
    lockId?: string;
    error?: string;
  }>;
}

/**
 * Lock multiple seats atomically
 */
export async function lockMultipleSeats(
  client: Redis,
  options: BatchLockOptions
): Promise<BatchLockResult> {
  const { seats, userId, ttlSeconds = REDIS_CONFIG.DEFAULT_LOCK_TTL_SECONDS } = options;
  
  const results: BatchLockResult['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  // Process each seat lock
  for (const seat of seats) {
    const lockResult = await lockSeat(client, {
      seatId: seat.seatId,
      showId: seat.showId,
      userId,
      ttlSeconds
    });

    if (lockResult.success) {
      successCount++;
    } else {
      failureCount++;
    }

    results.push({
      seatId: seat.seatId,
      showId: seat.showId,
      success: lockResult.success,
      lockId: lockResult.lockId,
      error: lockResult.error
    });
  }

  return {
    successCount,
    failureCount,
    results
  };
}

/**
 * Release multiple seats
 */
export async function releaseMultipleSeats(
  client: Redis,
  seats: Array<{ seatId: string; showId: string; lockId?: string }>,
  userId: string
): Promise<BatchLockResult> {
  const results: BatchLockResult['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const seat of seats) {
    const releaseResult = await releaseSeat(client, {
      seatId: seat.seatId,
      showId: seat.showId,
      userId,
      lockId: seat.lockId
    });

    if (releaseResult.success) {
      successCount++;
    } else {
      failureCount++;
    }

    results.push({
      seatId: seat.seatId,
      showId: seat.showId,
      success: releaseResult.success,
      error: releaseResult.error
    });
  }

  return {
    successCount,
    failureCount,
    results
  };
}

// ================================================
// LOCK VALIDATION
// ================================================

export async function validateLockOwnership(
  client: Redis,
  seatId: string,
  showId: string,
  lockId: string
): Promise<{ isValid: boolean; userId?: string; error?: string }> {
  try {
    const lockKey = generateSeatLockKey(showId, seatId);
    const currentLock = await client.get(lockKey);

    if (!currentLock) {
      return { isValid: false, error: 'Lock not found' };
    }

    if (currentLock !== lockId) {
      return { isValid: false, error: 'Lock ID mismatch' };
    }

    // Extract user ID from lock ID
    const { userId } = parseLockId(lockId);

    return { isValid: true, userId };

  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Validation error'
    };
  }
}