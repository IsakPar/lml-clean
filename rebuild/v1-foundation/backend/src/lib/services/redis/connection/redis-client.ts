/**
 * LML v1 Foundation - Redis Client
 * ================================
 * Pure Redis client setup and configuration
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import Redis, { RedisOptions } from 'ioredis';
import { REDIS_CONFIG } from '../config/constants';

// ================================================
// REDIS CLIENT CONFIGURATION
// ================================================

export interface RedisClientConfig {
  url: string;
  role: 'main' | 'subscriber' | 'publisher';
}

export function createRedisClientOptions(role: 'main' | 'subscriber' | 'publisher'): RedisOptions {
  const baseOptions: RedisOptions = {
    maxRetriesPerRequest: REDIS_CONFIG.MAX_RETRIES_PER_REQUEST,
    retryDelayOnFailover: REDIS_CONFIG.RETRY_DELAY_ON_FAILOVER,
    enableReadyCheck: true,
    connectTimeout: REDIS_CONFIG.CONNECT_TIMEOUT,
    commandTimeout: REDIS_CONFIG.COMMAND_TIMEOUT,
    lazyConnect: true,
  };

  // Main client gets additional optimizations
  if (role === 'main') {
    return {
      ...baseOptions,
      keepAlive: REDIS_CONFIG.KEEP_ALIVE,
      enableOfflineQueue: false,
      maxMemoryPolicy: 'allkeys-lru',
    };
  }

  // Pub/sub clients use simpler configuration
  return baseOptions;
}

// ================================================
// REDIS CLIENT FACTORY
// ================================================

export function createRedisClient(config: RedisClientConfig): Redis {
  const options = createRedisClientOptions(config.role);
  
  const client = new Redis(config.url, options);
  
  // Set client name for monitoring
  client.client('SETNAME', `lml-${config.role}`).catch(error => {
    console.warn(`⚠️ Failed to set Redis client name for ${config.role}:`, error);
  });

  return client;
}

// ================================================
// CLIENT CONNECTION TESTING
// ================================================

export async function testRedisConnection(client: Redis): Promise<void> {
  try {
    const result = await client.ping();
    if (result !== 'PONG') {
      throw new Error(`Unexpected ping response: ${result}`);
    }
  } catch (error) {
    throw new Error(`Redis connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ================================================
// CONNECTION RETRY LOGIC
// ================================================

export function calculateRetryDelay(attempt: number): number {
  const delay = Math.min(
    REDIS_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempt),
    REDIS_CONFIG.MAX_RETRY_DELAY_MS
  );
  return delay;
}

export async function connectWithRetry(
  client: Redis,
  maxRetries: number = REDIS_CONFIG.MAX_CONNECTION_RETRIES
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await client.connect();
      await testRedisConnection(client);
      console.log(`✅ Redis client connected successfully (attempt ${attempt + 1})`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown connection error');
      console.error(`❌ Redis connection failed (attempt ${attempt + 1}/${maxRetries}):`, lastError.message);

      if (attempt < maxRetries - 1) {
        const delay = calculateRetryDelay(attempt);
        console.log(`⏳ Retrying Redis connection in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Redis connection failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

// ================================================
// GRACEFUL CLIENT SHUTDOWN
// ================================================

export async function closeRedisClient(client: Redis, role: string): Promise<void> {
  try {
    if (client.status === 'ready') {
      await client.quit();
      console.log(`✅ Redis ${role} client closed gracefully`);
    }
  } catch (error) {
    console.error(`❌ Error closing Redis ${role} client:`, error);
    // Force disconnect if graceful quit fails
    client.disconnect();
  }
}