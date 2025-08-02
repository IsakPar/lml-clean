/**
 * LML v1 Foundation - Bulk Lock Operations
 * ========================================
 * Show-level and bulk seat operations using SCAN (production-safe)
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';
import { scanSeatLocks, scanWithTTL } from '../utils/scanner';
import { generateShowLockPattern, parseSeatLockKey, parseLockId } from '../utils/key-generator';
import type { SeatLockStatus } from './lock-status';

// ================================================
// BULK OPERATION INTERFACES
// ================================================

export interface ShowLockedSeat {
  seatId: string;
  userId: string;
  lockId: string;
  ttl: number;
  expiresAt: Date;
}

export interface ShowLockSummary {
  showId: string;
  totalLockedSeats: number;
  uniqueUsers: number;
  averageTTL: number;
  expiringSoon: number; // locks expiring within 60 seconds
  seats: ShowLockedSeat[];
}

export interface BulkScanOptions {
  showId: string;
  includeTTL?: boolean;
  includeExpiry?: boolean;
  batchSize?: number;
  maxIterations?: number;
}

export interface UserLockSummary {
  userId: string;
  lockCount: number;
  seats: Array<{
    seatId: string;
    showId: string;
    lockId: string;
    ttl: number;
  }>;
}

// ================================================
// SHOW-LEVEL LOCK QUERIES
// ================================================

/**
 * Get all locked seats for a show using SCAN (production-safe)
 */
export async function getShowLockedSeats(
  client: Redis,
  options: BulkScanOptions
): Promise<ShowLockSummary> {
  const { showId, includeTTL = true, includeExpiry = true } = options;

  try {
    // Use SCAN to find all seat locks for the show
    const scanResult = await scanSeatLocks(client, showId, {
      batchSize: options.batchSize,
      maxIterations: options.maxIterations,
    });

    if (scanResult.keys.length === 0) {
      return {
        showId,
        totalLockedSeats: 0,
        uniqueUsers: 0,
        averageTTL: 0,
        expiringSoon: 0,
        seats: [],
      };
    }

    // Get lock values and TTLs for all found keys
    const lockValues = await client.mget(...scanResult.keys);
    
    let ttlValues: number[] = [];
    if (includeTTL) {
      const pipeline = client.pipeline();
      scanResult.keys.forEach(key => pipeline.ttl(key));
      const ttlResults = await pipeline.exec();
      ttlValues = ttlResults ? ttlResults.map(result => result?.[1] as number) : [];
    }

    const seats: ShowLockedSeat[] = [];
    const userIds = new Set<string>();
    const validTTLs: number[] = [];
    let expiringSoon = 0;

    // Process each locked seat
    for (let i = 0; i < scanResult.keys.length; i++) {
      const key = scanResult.keys[i];
      const lockId = lockValues[i];
      const ttl = includeTTL ? ttlValues[i] : 0;

      if (lockId && ttl > 0) {
        try {
          // Parse seat ID from Redis key
          const { seatId } = parseSeatLockKey(key);
          
          // Parse user ID from lock ID
          const { userId } = parseLockId(lockId);

          userIds.add(userId);
          validTTLs.push(ttl);

          if (ttl < 60) {
            expiringSoon++;
          }

          seats.push({
            seatId,
            userId,
            lockId,
            ttl,
            expiresAt: includeExpiry ? new Date(Date.now() + (ttl * 1000)) : new Date(),
          });

        } catch (error) {
          console.warn(`Failed to parse lock data for key ${key}:`, error);
          // Skip invalid entries
        }
      }
    }

    const averageTTL = validTTLs.length > 0 
      ? validTTLs.reduce((sum, ttl) => sum + ttl, 0) / validTTLs.length 
      : 0;

    return {
      showId,
      totalLockedSeats: seats.length,
      uniqueUsers: userIds.size,
      averageTTL,
      expiringSoon,
      seats,
    };

  } catch (error) {
    console.error(`Error getting locked seats for show ${showId}:`, error);
    
    return {
      showId,
      totalLockedSeats: 0,
      uniqueUsers: 0,
      averageTTL: 0,
      expiringSoon: 0,
      seats: [],
    };
  }
}

/**
 * Get quick count of locked seats for a show
 */
export async function getShowLockCount(
  client: Redis,
  showId: string
): Promise<number> {
  try {
    const scanResult = await scanSeatLocks(client, showId);
    
    // Filter only keys with valid TTL
    if (scanResult.keys.length === 0) {
      return 0;
    }

    const pipeline = client.pipeline();
    scanResult.keys.forEach(key => pipeline.ttl(key));
    const ttlResults = await pipeline.exec();
    
    const validLocks = ttlResults?.filter(result => 
      result?.[1] !== null && (result[1] as number) > 0
    ).length || 0;

    return validLocks;

  } catch (error) {
    console.error(`Error counting locks for show ${showId}:`, error);
    return 0;
  }
}

// ================================================
// USER-LEVEL LOCK QUERIES
// ================================================

/**
 * Get all locks owned by a specific user across all shows
 */
export async function getUserLocks(
  client: Redis,
  userId: string
): Promise<UserLockSummary> {
  try {
    // Scan all seat lock keys
    const scanResult = await client.scan(
      '0',
      'MATCH', 'seat_lock:*:*',
      'COUNT', 1000
    );

    const allKeys = scanResult[1];
    
    if (allKeys.length === 0) {
      return {
        userId,
        lockCount: 0,
        seats: [],
      };
    }

    // Get all lock values
    const lockValues = await client.mget(...allKeys);
    const pipeline = client.pipeline();
    allKeys.forEach(key => pipeline.ttl(key));
    const ttlResults = await pipeline.exec();
    const ttlValues = ttlResults ? ttlResults.map(result => result?.[1] as number) : [];

    const userSeats: UserLockSummary['seats'] = [];

    // Filter locks owned by the specified user
    for (let i = 0; i < allKeys.length; i++) {
      const key = allKeys[i];
      const lockId = lockValues[i];
      const ttl = ttlValues[i];

      if (lockId && ttl > 0) {
        try {
          const { userId: lockUserId } = parseLockId(lockId);
          
          if (lockUserId === userId) {
            const { showId, seatId } = parseSeatLockKey(key);
            
            userSeats.push({
              seatId,
              showId,
              lockId,
              ttl,
            });
          }
        } catch (error) {
          // Skip invalid entries
        }
      }
    }

    return {
      userId,
      lockCount: userSeats.length,
      seats: userSeats,
    };

  } catch (error) {
    console.error(`Error getting locks for user ${userId}:`, error);
    return {
      userId,
      lockCount: 0,
      seats: [],
    };
  }
}

// ================================================
// BULK CLEANUP OPERATIONS
// ================================================

/**
 * Remove expired locks (TTL = -1 but key still exists)
 */
export async function cleanupExpiredLocks(
  client: Redis,
  showId?: string
): Promise<{ removedCount: number; scannedCount: number }> {
  try {
    const pattern = showId ? generateShowLockPattern(showId) : 'seat_lock:*:*';
    
    const scanResult = await client.scan(
      '0',
      'MATCH', pattern,
      'COUNT', 1000
    );

    const keys = scanResult[1];
    let removedCount = 0;

    if (keys.length === 0) {
      return { removedCount: 0, scannedCount: 0 };
    }

    // Check TTL for each key and remove expired ones
    const pipeline = client.pipeline();
    keys.forEach(key => pipeline.ttl(key));
    const ttlResults = await pipeline.exec();

    const expiredKeys: string[] = [];
    ttlResults?.forEach((result, index) => {
      const ttl = result?.[1] as number;
      if (ttl === -1 || ttl === -2) {  // -1: no expiry, -2: key doesn't exist
        expiredKeys.push(keys[index]);
      }
    });

    // Remove expired keys
    if (expiredKeys.length > 0) {
      removedCount = await client.del(...expiredKeys);
    }

    return {
      removedCount,
      scannedCount: keys.length,
    };

  } catch (error) {
    console.error('Error cleaning up expired locks:', error);
    return { removedCount: 0, scannedCount: 0 };
  }
}

/**
 * Release all locks for a specific user
 */
export async function releaseAllUserLocks(
  client: Redis,
  userId: string
): Promise<{ releasedCount: number; errors: string[] }> {
  try {
    const userLocks = await getUserLocks(client, userId);
    const errors: string[] = [];
    let releasedCount = 0;

    // Delete all locks owned by the user
    if (userLocks.seats.length > 0) {
      const keysToDelete = userLocks.seats.map(seat => 
        `seat_lock:${seat.showId}:${seat.seatId}`
      );

      try {
        releasedCount = await client.del(...keysToDelete);
      } catch (error) {
        errors.push(`Failed to delete locks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { releasedCount, errors };

  } catch (error) {
    return {
      releasedCount: 0,
      errors: [`Failed to release user locks: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

// ================================================
// SHOW STATISTICS
// ================================================

export interface ShowLockStatistics {
  showId: string;
  totalScanned: number;
  totalLocked: number;
  uniqueUsers: number;
  lockDistribution: Record<string, number>; // userId -> lock count
  ttlDistribution: {
    expiringSoon: number;    // < 60s
    shortTerm: number;       // 60s - 300s  
    mediumTerm: number;      // 300s - 900s
    longTerm: number;        // > 900s
  };
  averageTTL: number;
  oldestLock: number;
  newestLock: number;
}

/**
 * Get comprehensive statistics for show locks
 */
export async function getShowLockStatistics(
  client: Redis,
  showId: string
): Promise<ShowLockStatistics> {
  const showLocks = await getShowLockedSeats(client, { showId });
  
  const lockDistribution: Record<string, number> = {};
  const ttls: number[] = [];
  
  // Analyze lock distribution and TTLs
  showLocks.seats.forEach(seat => {
    lockDistribution[seat.userId] = (lockDistribution[seat.userId] || 0) + 1;
    ttls.push(seat.ttl);
  });

  // Categorize TTLs
  const ttlDistribution = {
    expiringSoon: ttls.filter(ttl => ttl < 60).length,
    shortTerm: ttls.filter(ttl => ttl >= 60 && ttl < 300).length,
    mediumTerm: ttls.filter(ttl => ttl >= 300 && ttl < 900).length,
    longTerm: ttls.filter(ttl => ttl >= 900).length,
  };

  return {
    showId,
    totalScanned: showLocks.totalLockedSeats,
    totalLocked: showLocks.totalLockedSeats,
    uniqueUsers: showLocks.uniqueUsers,
    lockDistribution,
    ttlDistribution,
    averageTTL: showLocks.averageTTL,
    oldestLock: ttls.length > 0 ? Math.max(...ttls) : 0,
    newestLock: ttls.length > 0 ? Math.min(...ttls) : 0,
  };
}