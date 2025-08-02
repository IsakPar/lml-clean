/**
 * LML v1 Foundation - Redis Service Orchestrator
 * ===============================================
 * Dependency injection and service composition
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor (Final)
 */

import type { Redis } from 'ioredis';
import { createRedisConnectionPool, type RedisConnectionPool } from './connection/connection-pool';
import { performBasicHealthCheck, performDetailedHealthCheck } from './health/health-monitor';
import { collectConnectionStats } from './health/connection-stats';
import { lockSeat, releaseSeat, lockMultipleSeats, releaseMultipleSeats, validateLockOwnership } from './locking/seat-locker';
import { getSeatLockStatus, getBulkSeatLockStatus, isSeatLocked, getSeatLockTTL } from './locking/lock-status';
import { getShowLockedSeats, getShowLockCount, getUserLocks, cleanupExpiredLocks, releaseAllUserLocks } from './locking/bulk-operations';
import { publishSeatEvent, publishBulkEvents, EventPublisherMonitor } from './events/event-publisher';
import { createSeatLockEvent, createSystemEvent, type SeatEvent } from './events/event-types';

// ================================================
// SERVICE INTERFACES
// ================================================

export interface RedisServiceConfig {
  url: string;
  autoConnect?: boolean;
  enableEvents?: boolean;
  enableMonitoring?: boolean;
}

export interface RedisServiceDependencies {
  connectionPool: RedisConnectionPool;
  publisherMonitor?: EventPublisherMonitor;
}

// ================================================
// MAIN REDIS SERVICE CLASS
// ================================================

export class RedisService {
  private connectionPool: RedisConnectionPool;
  private publisherMonitor?: EventPublisherMonitor;
  private config: RedisServiceConfig;

  constructor(config: RedisServiceConfig, dependencies?: Partial<RedisServiceDependencies>) {
    this.config = config;
    this.connectionPool = dependencies?.connectionPool || createRedisConnectionPool({ 
      url: config.url,
      autoConnect: config.autoConnect 
    });
    
    if (config.enableMonitoring) {
      this.publisherMonitor = dependencies?.publisherMonitor || new EventPublisherMonitor();
    }
  }

  // ================================================
  // CONNECTION MANAGEMENT
  // ================================================

  async connect(): Promise<void> {
    await this.connectionPool.connect();
  }

  async disconnect(): Promise<void> {
    await this.connectionPool.cleanup();
  }

  async getMainClient(): Promise<Redis> {
    return this.connectionPool.getMainClient();
  }

  async getPublisher(): Promise<Redis> {
    return this.connectionPool.getPublisher();
  }

  async getSubscriber(): Promise<Redis> {
    return this.connectionPool.getSubscriber();
  }

  // ================================================
  // HEALTH MONITORING
  // ================================================

  async healthCheck(): Promise<{
    status: 'connected' | 'error';
    responseTime?: number;
    error?: string;
    memoryUsage?: string;
    connectedClients?: number;
  }> {
    try {
      const client = await this.getMainClient();
      return await performBasicHealthCheck(client);
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async detailedHealthCheck() {
    const client = await this.getMainClient();
    return await performDetailedHealthCheck(client);
  }

  getConnectionStats() {
    return collectConnectionStats(this.connectionPool);
  }

  // ================================================
  // SEAT LOCKING OPERATIONS
  // ================================================

  async lockSeat(seatId: string, userId: string, showId: string, ttlSeconds?: number) {
    const client = await this.getMainClient();
    const result = await lockSeat(client, { seatId, userId, showId, ttlSeconds });

    // Publish event if successful and events are enabled
    if (result.success && this.config.enableEvents && result.lockId) {
      await this.publishLockEvent('seat_locked', showId, seatId, userId, result.lockId, ttlSeconds);
    }

    return result;
  }

  async releaseSeat(seatId: string, userId: string, showId: string, lockId?: string) {
    const client = await this.getMainClient();
    const result = await releaseSeat(client, { seatId, userId, showId, lockId });

    // Publish event if successful and events are enabled
    if (result.success && this.config.enableEvents) {
      await this.publishLockEvent('seat_released', showId, seatId, userId);
    }

    return result;
  }

  async lockMultipleSeats(seats: Array<{ seatId: string; showId: string }>, userId: string, ttlSeconds?: number) {
    const client = await this.getMainClient();
    return await lockMultipleSeats(client, { seats, userId, ttlSeconds });
  }

  async releaseMultipleSeats(seats: Array<{ seatId: string; showId: string; lockId?: string }>, userId: string) {
    const client = await this.getMainClient();
    return await releaseMultipleSeats(client, seats, userId);
  }

  async validateLockOwnership(seatId: string, showId: string, lockId: string) {
    const client = await this.getMainClient();
    return await validateLockOwnership(client, seatId, showId, lockId);
  }

  // ================================================
  // LOCK STATUS QUERIES
  // ================================================

  async getSeatLockStatus(seatId: string, showId: string) {
    const client = await this.getMainClient();
    return await getSeatLockStatus(client, { seatId, showId });
  }

  async getBulkSeatLockStatus(seats: Array<{ seatId: string; showId: string }>) {
    const client = await this.getMainClient();
    return await getBulkSeatLockStatus(client, { seats });
  }

  async isSeatLocked(seatId: string, showId: string) {
    const client = await this.getMainClient();
    return await isSeatLocked(client, seatId, showId);
  }

  async getSeatLockTTL(seatId: string, showId: string) {
    const client = await this.getMainClient();
    return await getSeatLockTTL(client, seatId, showId);
  }

  // ================================================
  // BULK OPERATIONS
  // ================================================

  async getShowLockedSeats(showId: string) {
    const client = await this.getMainClient();
    return await getShowLockedSeats(client, { showId });
  }

  async getShowLockCount(showId: string) {
    const client = await this.getMainClient();
    return await getShowLockCount(client, showId);
  }

  async getUserLocks(userId: string) {
    const client = await this.getMainClient();
    return await getUserLocks(client, userId);
  }

  async cleanupExpiredLocks(showId?: string) {
    const client = await this.getMainClient();
    return await cleanupExpiredLocks(client, showId);
  }

  async releaseAllUserLocks(userId: string) {
    const client = await this.getMainClient();
    return await releaseAllUserLocks(client, userId);
  }

  // ================================================
  // EVENT PUBLISHING
  // ================================================

  async publishEvent(event: SeatEvent) {
    if (!this.config.enableEvents) {
      return { success: false, error: 'Events not enabled', channelsSent: 0 };
    }

    const startTime = Date.now();
    try {
      const publisher = await this.getPublisher();
      const result = await publishSeatEvent(publisher, event);
      
      const latency = Date.now() - startTime;
      this.publisherMonitor?.recordPublish(latency, result.success);
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.publisherMonitor?.recordPublish(latency, false);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        channelsSent: 0
      };
    }
  }

  async publishBulkEvents(events: SeatEvent[]) {
    if (!this.config.enableEvents) {
      return { successCount: 0, failureCount: events.length, results: [] };
    }

    const publisher = await this.getPublisher();
    return await publishBulkEvents(publisher, events);
  }

  private async publishLockEvent(
    type: 'seat_locked' | 'seat_released',
    showId: string,
    seatId: string,
    userId: string,
    lockId?: string,
    ttlSeconds?: number
  ) {
    try {
      const event = createSeatLockEvent(showId, seatId, userId, type, { lockId, ttlSeconds });
      await this.publishEvent(event);
    } catch (error) {
      console.warn(`Failed to publish ${type} event:`, error);
      // Don't throw - event publishing failures shouldn't break operations
    }
  }

  // ================================================
  // MONITORING & STATS
  // ================================================

  getPublisherHealth() {
    return this.publisherMonitor?.getHealth();
  }

  resetPublisherStats() {
    this.publisherMonitor?.reset();
  }

  // ================================================
  // UTILITY METHODS
  // ================================================

  async ping(): Promise<string> {
    const client = await this.getMainClient();
    return await client.ping();
  }

  getConfig(): RedisServiceConfig {
    return { ...this.config };
  }
}

// ================================================
// FACTORY FUNCTIONS
// ================================================

export function createRedisService(config: RedisServiceConfig): RedisService {
  return new RedisService(config);
}

export function createRedisServiceWithDependencies(
  config: RedisServiceConfig,
  dependencies: RedisServiceDependencies
): RedisService {
  return new RedisService(config, dependencies);
}

// ================================================
// CONFIGURATION HELPERS
// ================================================

export function createProductionConfig(url: string): RedisServiceConfig {
  return {
    url,
    autoConnect: true,
    enableEvents: true,
    enableMonitoring: true,
  };
}

export function createDevelopmentConfig(url: string): RedisServiceConfig {
  return {
    url,
    autoConnect: true,
    enableEvents: true,
    enableMonitoring: false,
  };
}

export function createTestConfig(url: string): RedisServiceConfig {
  return {
    url,
    autoConnect: false,
    enableEvents: false,
    enableMonitoring: false,
  };
}

// ================================================
// EXPORTS
// ================================================

export * from './connection/connection-pool';
export * from './health/health-monitor';
export * from './health/connection-stats';
export * from './locking/seat-locker';
export * from './locking/lock-status';
export * from './locking/bulk-operations';
export * from './events/event-publisher';
export * from './events/event-types';
export * from './utils/key-generator';
export * from './utils/scanner';
export * from './config/constants';

export { RedisService as default };