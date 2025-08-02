/**
 * LML v1 Foundation - Simple Redis Service
 * =========================================
 * Simplified Redis service with single connection (for testing)
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor (Simplified)
 */

import Redis from 'ioredis';
import { lockSeat, releaseSeat } from './redis/locking/seat-locker';
import { getSeatLockStatus, getBulkSeatLockStatus } from './redis/locking/lock-status';
import { getShowLockedSeats } from './redis/locking/bulk-operations';
import { performBasicHealthCheck } from './redis/health/health-monitor';

// ================================================
// SIMPLE REDIS SERVICE
// ================================================

export class SimpleRedisService {
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private redisUrl: string) {}

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      console.log('🔌 Connecting to Redis (simple)...');
      
      this.client = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: false,
        keepAlive: 30000,
        commandTimeout: 5000,
      });

      // Wait for connection
      await this.client.ping();
      
      this.isConnected = true;
      console.log('✅ Simple Redis service connected successfully');

    } catch (error) {
      console.error('❌ Simple Redis connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        console.log('✅ Simple Redis service disconnected');
      } catch (error) {
        console.error('❌ Error disconnecting simple Redis:', error);
      } finally {
        this.client = null;
        this.isConnected = false;
      }
    }
  }

  private async getClient(): Promise<Redis> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
    return this.client!;
  }

  // ================================================
  // HEALTH CHECK
  // ================================================

  async healthCheck() {
    try {
      const client = await this.getClient();
      return await performBasicHealthCheck(client);
    } catch (error) {
      return {
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ================================================
  // SEAT LOCKING OPERATIONS
  // ================================================

  async lockSeat(seatId: string, userId: string, showId: string, ttlSeconds?: number) {
    const client = await this.getClient();
    return await lockSeat(client, { seatId, userId, showId, ttlSeconds });
  }

  async releaseSeat(seatId: string, userId: string, showId: string, lockId?: string) {
    const client = await this.getClient();
    return await releaseSeat(client, { seatId, userId, showId, lockId });
  }

  async getSeatLockStatus(seatId: string, showId: string) {
    const client = await this.getClient();
    return await getSeatLockStatus(client, { seatId, showId });
  }

  async getBulkSeatLockStatus(seats: Array<{ seatId: string; showId: string }>) {
    const client = await this.getClient();
    return await getBulkSeatLockStatus(client, { seats });
  }

  async getShowLockedSeats(showId: string) {
    const client = await this.getClient();
    return await getShowLockedSeats(client, { showId });
  }

  async ping(): Promise<string> {
    const client = await this.getClient();
    return await client.ping();
  }

  getConnectionStats() {
    return {
      isConnected: this.isConnected,
      clientStatus: this.client?.status || 'disconnected'
    };
  }
}

// ================================================
// SINGLETON INSTANCE
// ================================================

let simpleRedisServiceInstance: SimpleRedisService | null = null;

export async function getSimpleRedisService(): Promise<SimpleRedisService> {
  if (simpleRedisServiceInstance) {
    return simpleRedisServiceInstance;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  simpleRedisServiceInstance = new SimpleRedisService(redisUrl);
  await simpleRedisServiceInstance.connect();
  
  return simpleRedisServiceInstance;
}

export default SimpleRedisService;