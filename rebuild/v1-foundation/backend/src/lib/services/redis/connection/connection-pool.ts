/**
 * LML v1 Foundation - Redis Connection Pool
 * =========================================
 * Multi-client connection management with DI pattern
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';
import { createRedisClient, connectWithRetry, closeRedisClient } from './redis-client';
import { setupRedisEventHandlers } from './event-handlers';

// ================================================
// CONNECTION POOL INTERFACES
// ================================================

export interface RedisConnectionConfig {
  url: string;
  autoConnect?: boolean;
}

export interface RedisClients {
  main: Redis;
  subscriber: Redis;
  publisher: Redis;
}

export interface ConnectionStats {
  isConnected: boolean;
  connectionAttempts: number;
  mainStatus: string;
  subscriberStatus: string;
  publisherStatus: string;
}

// ================================================
// CONNECTION POOL CLASS
// ================================================

export class RedisConnectionPool {
  private clients: Partial<RedisClients> = {};
  private isConnected = false;
  private connectionAttempts = 0;
  private config: RedisConnectionConfig;

  constructor(config: RedisConnectionConfig) {
    this.config = config;
  }

  // ================================================
  // CONNECTION MANAGEMENT
  // ================================================

  async connect(): Promise<RedisClients> {
    if (this.isConnected && this.areAllClientsReady()) {
      return this.clients as RedisClients;
    }

    try {
      this.connectionAttempts++;
      console.log('🔌 Connecting to Redis cluster...');
      console.log('📍 Redis URL:', this.config.url.replace(/:[^:]*@/, ':****@'));

      // Create all clients
      this.clients.main = createRedisClient({ url: this.config.url, role: 'main' });
      this.clients.subscriber = createRedisClient({ url: this.config.url, role: 'subscriber' });
      this.clients.publisher = createRedisClient({ url: this.config.url, role: 'publisher' });

      // Set up event handlers for all clients
      setupRedisEventHandlers(this.clients.main, 'main', this.onConnectionStateChange.bind(this));
      setupRedisEventHandlers(this.clients.subscriber, 'subscriber', this.onConnectionStateChange.bind(this));
      setupRedisEventHandlers(this.clients.publisher, 'publisher', this.onConnectionStateChange.bind(this));

      // Connect all clients with retry logic
      await Promise.all([
        connectWithRetry(this.clients.main),
        connectWithRetry(this.clients.subscriber),
        connectWithRetry(this.clients.publisher),
      ]);

      this.isConnected = true;
      console.log('✅ Redis cluster connected successfully');
      console.log('🚀 All Redis clients ready for commands');

      return this.clients as RedisClients;

    } catch (error) {
      console.error('❌ Redis cluster connection failed:', error);
      await this.cleanup();
      throw error;
    }
  }

  // ================================================
  // CLIENT ACCESS
  // ================================================

  async getMainClient(): Promise<Redis> {
    if (!this.clients.main || !this.isConnected) {
      const clients = await this.connect();
      return clients.main;
    }
    return this.clients.main;
  }

  async getSubscriber(): Promise<Redis> {
    if (!this.clients.subscriber || !this.isConnected) {
      const clients = await this.connect();
      return clients.subscriber;
    }
    return this.clients.subscriber;
  }

  async getPublisher(): Promise<Redis> {
    if (!this.clients.publisher || !this.isConnected) {
      const clients = await this.connect();
      return clients.publisher;
    }
    return this.clients.publisher;
  }

  // ================================================
  // CONNECTION STATE MONITORING
  // ================================================

  private onConnectionStateChange(role: string, connected: boolean): void {
    console.log(`🔄 Redis ${role} client ${connected ? 'connected' : 'disconnected'}`);
    
    // Update overall connection state
    this.isConnected = this.areAllClientsReady();
  }

  private areAllClientsReady(): boolean {
    return !!(
      this.clients.main?.status === 'ready' &&
      this.clients.subscriber?.status === 'ready' &&
      this.clients.publisher?.status === 'ready'
    );
  }

  getConnectionStats(): ConnectionStats {
    return {
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      mainStatus: this.clients.main?.status || 'disconnected',
      subscriberStatus: this.clients.subscriber?.status || 'disconnected',
      publisherStatus: this.clients.publisher?.status || 'disconnected',
    };
  }

  // ================================================
  // CLEANUP & SHUTDOWN
  // ================================================

  async cleanup(): Promise<void> {
    try {
      console.log('🧹 Cleaning up Redis connection pool...');

      const cleanupPromises = [];

      if (this.clients.main) {
        cleanupPromises.push(closeRedisClient(this.clients.main, 'main'));
      }

      if (this.clients.subscriber) {
        cleanupPromises.push(closeRedisClient(this.clients.subscriber, 'subscriber'));
      }

      if (this.clients.publisher) {
        cleanupPromises.push(closeRedisClient(this.clients.publisher, 'publisher'));
      }

      await Promise.all(cleanupPromises);

      this.clients = {};
      this.isConnected = false;

      console.log('✅ Redis connection pool cleaned up');

    } catch (error) {
      console.error('❌ Error during Redis cleanup:', error);
    }
  }
}

// ================================================
// FACTORY FUNCTION (DI PATTERN)
// ================================================

export function createRedisConnectionPool(config: RedisConnectionConfig): RedisConnectionPool {
  return new RedisConnectionPool(config);
}