/**
 * LML v1 Foundation - PostgreSQL Lock Fallback System
 * ==================================================
 * Production-grade fallback using seat_locks table with TTL
 * Addresses advisory lock limitations with proper ownership tracking
 * Created: 2025-08-05
 * Status: Phase 2C - Enterprise Fallback Architecture
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, lt, sql } from 'drizzle-orm';
import { pgTable, uuid, timestamp, varchar, index } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { 
  SeatLockRequest, 
  SeatLockResult, 
  SeatLockStatus, 
  SeatLockOwnership 
} from './seat-lock';
import { 
  recordLockAcquisition, 
  recordLockFailure, 
  recordLockRelease,
  recordRedisOperationFailure 
} from './lock-metrics';

// ================================================
// POSTGRESQL LOCKS TABLE SCHEMA
// ================================================

export const seatLocks = pgTable('seat_locks', {
  seatId: varchar('seat_id', { length: 100 }).primaryKey(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  sessionId: varchar('session_id', { length: 100 }).notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  showId: varchar('show_id', { length: 100 }).notNull(),
  venueId: varchar('venue_id', { length: 100 }).notNull(),
}, (table) => ({
  expiresAtIdx: index('seat_locks_expires_at_idx').on(table.expiresAt),
  userSessionIdx: index('seat_locks_user_session_idx').on(table.userId, table.sessionId),
  showIdx: index('seat_locks_show_idx').on(table.showId),
}));

// ================================================
// DATABASE CONNECTION
// ================================================

let postgresClient: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

async function getPostgresLockingDB() {
  if (!db) {
    try {
      postgresClient = postgres(process.env.DATABASE_URL!, {
        max: 5, // Small pool for locking operations
        idle_timeout: 20,
        connect_timeout: 10,
      });
      
      db = drizzle(postgresClient);
      console.log('✅ PostgreSQL Locking DB connected');
    } catch (error) {
      console.error('❌ PostgreSQL Locking DB connection failed:', error);
      throw new Error('PostgreSQL locking service unavailable');
    }
  }
  
  return db;
}

// ================================================
// CORE POSTGRESQL LOCK OPERATIONS
// ================================================

/**
 * Acquire seat lock using PostgreSQL table with TTL
 */
export async function acquireSeatLockPostgres(request: SeatLockRequest): Promise<SeatLockResult> {
  const startTime = Date.now();
  
  try {
    const database = await getPostgresLockingDB();
    const ttlMs = request.ttlMs || (3 * 60 * 1000); // 3 minutes default
    const expiresAt = new Date(Date.now() + ttlMs);
    
    // First, clean up any expired locks for this seat
    await database
      .delete(seatLocks)
      .where(and(
        eq(seatLocks.seatId, request.seatId),
        lt(seatLocks.expiresAt, new Date())
      ));
    
    // Try to insert new lock (will fail if seat already locked)
    try {
      const [insertedLock] = await database
        .insert(seatLocks)
        .values({
          seatId: request.seatId,
          userId: request.userId,
          sessionId: request.sessionId,
          expiresAt,
          showId: 'unknown', // TODO: Add to request
          venueId: 'unknown', // TODO: Add to request
        })
        .returning();
      
      const ownership: SeatLockOwnership = {
        userId: request.userId,
        sessionId: request.sessionId,
        acquiredAt: insertedLock.lockedAt,
        expiresAt: insertedLock.expiresAt,
      };
      
      recordLockAcquisition(request.seatId, request.userId, ttlMs);
      
      console.log(`🔒 [POSTGRES] Seat lock acquired: ${request.seatId} by ${request.userId}:${request.sessionId}`);
      
      return {
        success: true,
        ownership,
      };
      
    } catch (insertError: any) {
      // Lock already exists - check who owns it
      const [existingLock] = await database
        .select()
        .from(seatLocks)
        .where(eq(seatLocks.seatId, request.seatId))
        .limit(1);
      
      if (existingLock) {
        const remainingMs = existingLock.expiresAt.getTime() - Date.now();
        
        recordLockFailure(request.seatId, request.userId, 'already_locked');
        
        return {
          success: false,
          error: 'Seat is currently locked by another user',
          conflictOwner: `${existingLock.userId}:${existingLock.sessionId}`,
          retryAfterMs: Math.max(0, remainingMs),
        };
      } else {
        // Race condition - lock was just released
        recordLockFailure(request.seatId, request.userId, 'race_condition');
        
        return {
          success: false,
          error: 'Lock acquisition race condition - retry',
          retryAfterMs: 1000, // Retry after 1 second
        };
      }
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    recordRedisOperationFailure('postgres_lock_acquire', error instanceof Error ? error.message : 'unknown');
    
    console.error(`❌ [POSTGRES] Seat lock acquisition failed for ${request.seatId}:`, error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PostgreSQL lock error',
    };
  }
}

/**
 * Release seat lock in PostgreSQL with ownership validation
 */
export async function releaseSeatLockPostgres(
  seatId: string,
  userId: string,
  sessionId: string
): Promise<SeatLockResult> {
  try {
    const database = await getPostgresLockingDB();
    
    // Delete lock only if owned by this user/session
    const result = await database
      .delete(seatLocks)
      .where(and(
        eq(seatLocks.seatId, seatId),
        eq(seatLocks.userId, userId),
        eq(seatLocks.sessionId, sessionId)
      ))
      .returning();
    
    if (result.length === 0) {
      // Check if lock exists but owned by someone else
      const [existingLock] = await database
        .select()
        .from(seatLocks)
        .where(eq(seatLocks.seatId, seatId))
        .limit(1);
      
      if (existingLock) {
        recordLockFailure(seatId, userId, 'ownership_mismatch');
        
        return {
          success: false,
          error: 'Cannot release lock - not the owner',
          conflictOwner: `${existingLock.userId}:${existingLock.sessionId}`,
        };
      } else {
        // No lock found - idempotent success
        return {
          success: true,
          error: 'No lock found to release (idempotent)',
        };
      }
    }
    
    recordLockRelease(seatId, userId);
    
    console.log(`🔓 [POSTGRES] Seat lock released: ${seatId} by ${userId}:${sessionId}`);
    
    return {
      success: true,
    };
    
  } catch (error) {
    recordRedisOperationFailure('postgres_lock_release', error instanceof Error ? error.message : 'unknown');
    
    console.error(`❌ [POSTGRES] Seat lock release failed for ${seatId}:`, error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PostgreSQL release error',
    };
  }
}

/**
 * Get seat lock status from PostgreSQL
 */
export async function getSeatLockStatusPostgres(seatId: string): Promise<SeatLockStatus> {
  try {
    const database = await getPostgresLockingDB();
    
    // Clean up expired locks first
    await database
      .delete(seatLocks)
      .where(and(
        eq(seatLocks.seatId, seatId),
        lt(seatLocks.expiresAt, new Date())
      ));
    
    const [lock] = await database
      .select()
      .from(seatLocks)
      .where(eq(seatLocks.seatId, seatId))
      .limit(1);
    
    if (!lock) {
      return {
        isLocked: false,
      };
    }
    
    const remainingMs = lock.expiresAt.getTime() - Date.now();
    
    if (remainingMs <= 0) {
      // Lock expired - clean it up
      await database
        .delete(seatLocks)
        .where(eq(seatLocks.seatId, seatId));
      
      return {
        isLocked: false,
      };
    }
    
    return {
      isLocked: true,
      owner: {
        userId: lock.userId,
        sessionId: lock.sessionId,
        acquiredAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
      },
      remainingTtlMs: remainingMs,
    };
    
  } catch (error) {
    console.error(`❌ [POSTGRES] Failed to check seat lock status for ${seatId}:`, error);
    return {
      isLocked: false, // Fail open - assume unlocked on error
    };
  }
}

/**
 * Check if specific user holds the lock in PostgreSQL
 */
export async function isLockHeldByUserPostgres(
  seatId: string,
  userId: string,
  sessionId: string
): Promise<boolean> {
  try {
    const database = await getPostgresLockingDB();
    
    const [lock] = await database
      .select()
      .from(seatLocks)
      .where(and(
        eq(seatLocks.seatId, seatId),
        eq(seatLocks.userId, userId),
        eq(seatLocks.sessionId, sessionId),
        sql`${seatLocks.expiresAt} > NOW()`
      ))
      .limit(1);
    
    return !!lock;
    
  } catch (error) {
    console.error(`❌ [POSTGRES] Failed to check lock ownership for ${seatId}:`, error);
    return false; // Fail secure - assume not owned on error
  }
}

/**
 * Extend lock TTL in PostgreSQL
 */
export async function extendSeatLockTTLPostgres(
  seatId: string,
  userId: string,
  sessionId: string,
  additionalTtlMs: number
): Promise<SeatLockResult> {
  try {
    const database = await getPostgresLockingDB();
    
    const result = await database
      .update(seatLocks)
      .set({
        expiresAt: sql`${seatLocks.expiresAt} + INTERVAL '${additionalTtlMs} milliseconds'`,
      })
      .where(and(
        eq(seatLocks.seatId, seatId),
        eq(seatLocks.userId, userId),
        eq(seatLocks.sessionId, sessionId),
        sql`${seatLocks.expiresAt} > NOW()`
      ))
      .returning();
    
    if (result.length === 0) {
      recordLockFailure(seatId, userId, 'ownership_mismatch');
      
      return {
        success: false,
        error: 'Cannot extend lock - not found or not owned',
      };
    }
    
    const updatedLock = result[0];
    
    console.log(`⏰ [POSTGRES] Seat lock extended: ${seatId} by ${additionalTtlMs}ms`);
    
    return {
      success: true,
      ownership: {
        userId,
        sessionId,
        acquiredAt: updatedLock.lockedAt,
        expiresAt: updatedLock.expiresAt,
      },
    };
    
  } catch (error) {
    recordRedisOperationFailure('postgres_lock_extend', error instanceof Error ? error.message : 'unknown');
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PostgreSQL extension error',
    };
  }
}

/**
 * Cleanup expired locks (background job)
 */
export async function cleanupExpiredLocksPostgres(): Promise<number> {
  try {
    const database = await getPostgresLockingDB();
    
    const result = await database
      .delete(seatLocks)
      .where(lt(seatLocks.expiresAt, new Date()))
      .returning();
    
    const cleanedCount = result.length;
    
    if (cleanedCount > 0) {
      console.log(`🧹 [POSTGRES] Cleaned up ${cleanedCount} expired seat locks`);
    }
    
    return cleanedCount;
    
  } catch (error) {
    console.error('❌ [POSTGRES] Failed to cleanup expired locks:', error);
    return 0;
  }
}

/**
 * Get lock statistics for PostgreSQL backend
 */
export async function getLockStatisticsPostgres(): Promise<{
  totalLocks: number;
  locksByTTL: {
    expiringSoon: number; // < 30 seconds
    shortTerm: number;    // 30s - 2min
    longTerm: number;     // > 2min
  };
}> {
  try {
    const database = await getPostgresLockingDB();
    
    const now = new Date();
    const thirtySecondsFromNow = new Date(now.getTime() + 30000);
    const twoMinutesFromNow = new Date(now.getTime() + 120000);
    
    const [stats] = await database
      .select({
        total: sql<number>`COUNT(*)`,
        expiring_soon: sql<number>`COUNT(*) FILTER (WHERE expires_at <= ${thirtySecondsFromNow})`,
        short_term: sql<number>`COUNT(*) FILTER (WHERE expires_at > ${thirtySecondsFromNow} AND expires_at <= ${twoMinutesFromNow})`,
        long_term: sql<number>`COUNT(*) FILTER (WHERE expires_at > ${twoMinutesFromNow})`,
      })
      .from(seatLocks)
      .where(sql`expires_at > NOW()`);
    
    return {
      totalLocks: stats.total,
      locksByTTL: {
        expiringSoon: stats.expiring_soon,
        shortTerm: stats.short_term,
        longTerm: stats.long_term,
      },
    };
    
  } catch (error) {
    console.error('❌ [POSTGRES] Failed to get lock statistics:', error);
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

/**
 * Graceful shutdown for PostgreSQL locking service
 */
export async function shutdownPostgresLocking(): Promise<void> {
  if (postgresClient) {
    try {
      await postgresClient.end();
      console.log('✅ PostgreSQL Locking DB disconnected gracefully');
    } catch (error) {
      console.error('PostgreSQL locking shutdown error:', error);
    }
  }
}