/**
 * LML v1 Foundation - Redis Connection
 * ===================================
 * Redis connection for sessions and caching
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import Redis from 'ioredis';

// ================================================
// CONNECTION CONFIGURATION
// ================================================

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is required');
}

// TypeScript type guard: redisUrl is guaranteed to be string after this point
const validatedRedisUrl: string = redisUrl;

// ================================================
// REDIS CLIENT SINGLETON
// ================================================

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(validatedRedisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      commandTimeout: 5000,
    });

    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redis.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
    });

    redis.on('ready', () => {
      console.log('🚀 Redis ready for commands');
    });
  }

  return redis;
}

// ================================================
// CONNECTION HEALTH CHECK
// ================================================

export async function checkRedisHealth(): Promise<{
  status: 'connected' | 'error';
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const client = getRedisClient();
    
    // Simple ping to verify connection
    await client.ping();
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'connected',
      responseTime
    };
  } catch (error) {
    console.error('Redis health check failed:', error);
    
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ================================================
// SEAT RESERVATION UTILITIES
// ================================================

/**
 * Reserve seats for 15 minutes during booking process
 */
export async function reserveSeats(
  showId: number,
  seatIds: string[],
  sessionId: string
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pipeline = client.pipeline();
    
    const expiry = 15 * 60; // 15 minutes in seconds
    
    for (const seatId of seatIds) {
      const key = `seat_reservation:${showId}:${seatId}`;
      pipeline.setex(key, expiry, sessionId);
    }
    
    await pipeline.exec();
    
    console.log(`🔒 Reserved ${seatIds.length} seats for show ${showId}, session ${sessionId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to reserve seats:', error);
    return false;
  }
}

/**
 * Release seat reservations
 */
export async function releaseSeats(
  showId: number,
  seatIds: string[]
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pipeline = client.pipeline();
    
    for (const seatId of seatIds) {
      const key = `seat_reservation:${showId}:${seatId}`;
      pipeline.del(key);
    }
    
    await pipeline.exec();
    
    console.log(`🔓 Released ${seatIds.length} seats for show ${showId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to release seats:', error);
    return false;
  }
}

/**
 * Check if seats are currently reserved
 */
export async function areSeatsReserved(
  showId: number,
  seatIds: string[]
): Promise<Record<string, boolean>> {
  try {
    const client = getRedisClient();
    const pipeline = client.pipeline();
    
    for (const seatId of seatIds) {
      const key = `seat_reservation:${showId}:${seatId}`;
      pipeline.exists(key);
    }
    
    const results = await pipeline.exec();
    const reservations: Record<string, boolean> = {};
    
    seatIds.forEach((seatId, index) => {
      reservations[seatId] = results?.[index]?.[1] === 1;
    });
    
    return reservations;
  } catch (error) {
    console.error('❌ Failed to check seat reservations:', error);
    // Return all seats as not reserved on error
    return seatIds.reduce((acc, seatId) => {
      acc[seatId] = false;
      return acc;
    }, {} as Record<string, boolean>);
  }
}

// ================================================
// GRACEFUL SHUTDOWN
// ================================================

export async function closeRedisConnection(): Promise<void> {
  try {
    if (redis) {
      await redis.quit();
      redis = null;
      console.log('✅ Redis connection closed gracefully');
    }
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error);
  }
}

// Handle process termination
process.on('SIGTERM', closeRedisConnection);
process.on('SIGINT', closeRedisConnection);