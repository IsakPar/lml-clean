/**
 * LML v1 Foundation - Lock Status Queries
 * ========================================
 * Seat lock status and TTL information queries
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';
import { generateSeatLockKey, parseLockId } from '../utils/key-generator';

// ================================================
// LOCK STATUS INTERFACES
// ================================================

export interface SeatLockStatus {
  seatId: string;
  showId: string;
  isLocked: boolean;
  lockId?: string;
  userId?: string;
  ttl?: number;
  expiresAt?: Date;
}

export interface LockStatusQuery {
  seatId: string;
  showId: string;
  includeTTL?: boolean;
  includeExpiry?: boolean;
}

export interface BulkLockStatusQuery {
  seats: Array<{ seatId: string; showId: string }>;
  includeTTL?: boolean;
  includeExpiry?: boolean;
}

export interface BulkLockStatusResult {
  totalSeats: number;
  lockedSeats: number;
  availableSeats: number;
  results: SeatLockStatus[];
}

// ================================================
// SINGLE SEAT STATUS QUERIES
// ================================================

/**
 * Get lock status for a single seat
 */
export async function getSeatLockStatus(
  client: Redis,
  options: LockStatusQuery
): Promise<SeatLockStatus> {
  const { seatId, showId, includeTTL = true, includeExpiry = false } = options;

  try {
    const lockKey = generateSeatLockKey(showId, seatId);

    // Get lock value and TTL in parallel if needed
    const queries = [client.get(lockKey)];
    if (includeTTL) {
      queries.push(client.ttl(lockKey));
    }

    const results = await Promise.all(queries);
    const lockId = results[0] as string | null;
    const ttl = includeTTL ? (results[1] as number) : undefined;

    // Base status object
    const status: SeatLockStatus = {
      seatId,
      showId,
      isLocked: false,
    };

    if (lockId) {
      try {
        // Extract user ID from lock ID
        const { userId } = parseLockId(lockId);

        status.isLocked = true;
        status.lockId = lockId;
        status.userId = userId;

        if (includeTTL && ttl !== undefined && ttl > 0) {
          status.ttl = ttl;
        }

        if (includeExpiry && ttl !== undefined && ttl > 0) {
          status.expiresAt = new Date(Date.now() + (ttl * 1000));
        }

      } catch (error) {
        console.warn(`Invalid lock ID format for seat ${seatId}: ${lockId}`);
        // Lock exists but has invalid format - treat as locked but with unknown user
        status.isLocked = true;
        status.lockId = lockId;
      }
    }

    return status;

  } catch (error) {
    console.error(`Error getting lock status for seat ${seatId}:`, error);
    
    return {
      seatId,
      showId,
      isLocked: false, // Assume available on error
    };
  }
}

/**
 * Check if a seat is currently locked
 */
export async function isSeatLocked(
  client: Redis,
  seatId: string,
  showId: string
): Promise<boolean> {
  try {
    const lockKey = generateSeatLockKey(showId, seatId);
    const exists = await client.exists(lockKey);
    return exists === 1;
  } catch (error) {
    console.error(`Error checking if seat ${seatId} is locked:`, error);
    return false; // Assume available on error
  }
}

/**
 * Get remaining TTL for a seat lock
 */
export async function getSeatLockTTL(
  client: Redis,
  seatId: string,
  showId: string
): Promise<number | null> {
  try {
    const lockKey = generateSeatLockKey(showId, seatId);
    const ttl = await client.ttl(lockKey);
    
    // TTL values: -2 (key doesn't exist), -1 (no expiry), >0 (seconds remaining)
    return ttl > 0 ? ttl : null;
  } catch (error) {
    console.error(`Error getting TTL for seat ${seatId}:`, error);
    return null;
  }
}

// ================================================
// BULK STATUS QUERIES
// ================================================

/**
 * Get lock status for multiple seats efficiently
 */
export async function getBulkSeatLockStatus(
  client: Redis,
  options: BulkLockStatusQuery
): Promise<BulkLockStatusResult> {
  const { seats, includeTTL = true, includeExpiry = false } = options;

  const results: SeatLockStatus[] = [];
  let lockedCount = 0;

  try {
    // Build all Redis keys
    const lockKeys = seats.map(seat => generateSeatLockKey(seat.showId, seat.seatId));

    // Batch get all lock values
    const lockValues = lockKeys.length > 0 ? await client.mget(...lockKeys) : [];

    // Batch get TTLs if requested
    let ttlValues: (number | null)[] = [];
    if (includeTTL && lockKeys.length > 0) {
      // Use pipeline for efficient TTL queries
      const pipeline = client.pipeline();
      lockKeys.forEach(key => pipeline.ttl(key));
      const ttlResults = await pipeline.exec();
      ttlValues = ttlResults ? ttlResults.map(result => result?.[1] as number) : [];
    }

    // Process results
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      const lockId = lockValues[i];
      const ttl = includeTTL ? ttlValues[i] : undefined;

      const status: SeatLockStatus = {
        seatId: seat.seatId,
        showId: seat.showId,
        isLocked: false,
      };

      if (lockId) {
        try {
          const { userId } = parseLockId(lockId);
          
          status.isLocked = true;
          status.lockId = lockId;
          status.userId = userId;
          lockedCount++;

          if (includeTTL && ttl !== undefined && ttl > 0) {
            status.ttl = ttl;
          }

          if (includeExpiry && ttl !== undefined && ttl > 0) {
            status.expiresAt = new Date(Date.now() + (ttl * 1000));
          }

        } catch (error) {
          console.warn(`Invalid lock ID format for seat ${seat.seatId}: ${lockId}`);
          status.isLocked = true;
          status.lockId = lockId;
          lockedCount++;
        }
      }

      results.push(status);
    }

  } catch (error) {
    console.error('Error in bulk seat lock status query:', error);
    
    // Return error-safe results
    seats.forEach(seat => {
      results.push({
        seatId: seat.seatId,
        showId: seat.showId,
        isLocked: false, // Assume available on error
      });
    });
  }

  return {
    totalSeats: seats.length,
    lockedSeats: lockedCount,
    availableSeats: seats.length - lockedCount,
    results,
  };
}

// ================================================
// LOCK STATUS FILTERING
// ================================================

export interface StatusFilter {
  lockedOnly?: boolean;
  availableOnly?: boolean;
  userId?: string;
  minTTL?: number;
  maxTTL?: number;
}

/**
 * Filter seat lock status results
 */
export function filterLockStatus(
  statuses: SeatLockStatus[],
  filter: StatusFilter
): SeatLockStatus[] {
  return statuses.filter(status => {
    // Filter by lock state
    if (filter.lockedOnly && !status.isLocked) return false;
    if (filter.availableOnly && status.isLocked) return false;

    // Filter by user ID
    if (filter.userId && status.userId !== filter.userId) return false;

    // Filter by TTL range
    if (status.ttl !== undefined) {
      if (filter.minTTL !== undefined && status.ttl < filter.minTTL) return false;
      if (filter.maxTTL !== undefined && status.ttl > filter.maxTTL) return false;
    }

    return true;
  });
}

/**
 * Group lock statuses by user
 */
export function groupLockStatusByUser(
  statuses: SeatLockStatus[]
): Record<string, SeatLockStatus[]> {
  const grouped: Record<string, SeatLockStatus[]> = {};

  statuses.forEach(status => {
    if (status.userId) {
      if (!grouped[status.userId]) {
        grouped[status.userId] = [];
      }
      grouped[status.userId].push(status);
    }
  });

  return grouped;
}

/**
 * Get lock status summary statistics
 */
export function getLockStatusSummary(statuses: SeatLockStatus[]): {
  total: number;
  locked: number;
  available: number;
  uniqueUsers: number;
  averageTTL: number;
  expiringSoon: number; // locks expiring in <60 seconds
} {
  const locked = statuses.filter(s => s.isLocked);
  const available = statuses.filter(s => !s.isLocked);
  const uniqueUsers = new Set(locked.map(s => s.userId).filter(Boolean)).size;

  const ttls = locked.map(s => s.ttl).filter((ttl): ttl is number => ttl !== undefined);
  const averageTTL = ttls.length > 0 ? ttls.reduce((sum, ttl) => sum + ttl, 0) / ttls.length : 0;
  
  const expiringSoon = locked.filter(s => s.ttl !== undefined && s.ttl < 60).length;

  return {
    total: statuses.length,
    locked: locked.length,
    available: available.length,
    uniqueUsers,
    averageTTL,
    expiringSoon,
  };
}