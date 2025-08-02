/**
 * LML v1 Foundation - Redis Configuration Constants
 * =================================================
 * Centralized configuration for Redis service
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

export const REDIS_CONFIG = {
  // Connection settings
  MAX_RETRIES_PER_REQUEST: 3,
  RETRY_DELAY_ON_FAILOVER: 100,
  CONNECT_TIMEOUT: 10000,
  COMMAND_TIMEOUT: 5000,
  KEEP_ALIVE: 30000,
  
  // Connection pool settings
  MAX_CONNECTION_RETRIES: 5,
  RETRY_BASE_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  
  // Seat locking settings  
  DEFAULT_LOCK_TTL_SECONDS: 900, // 15 minutes
  MAX_LOCK_TTL_SECONDS: 1800,    // 30 minutes
  MAX_LOCKS_PER_USER: 10,
  
  // Key patterns
  SEAT_LOCK_KEY_PREFIX: 'seat_lock',
  SEAT_EVENTS_CHANNEL_PREFIX: 'seat_events',
  
  // Bulk operations
  SCAN_BATCH_SIZE: 100,
  MAX_SCAN_ITERATIONS: 1000,
  
  // Health monitoring
  HEALTH_CHECK_TIMEOUT_MS: 5000,
  INFO_COMMANDS: {
    MEMORY: 'memory',
    CLIENTS: 'clients'
  }
} as const;

export const REDIS_KEY_PATTERNS = {
  SEAT_LOCK: (showId: string, seatId: string) => `${REDIS_CONFIG.SEAT_LOCK_KEY_PREFIX}:${showId}:${seatId}`,
  SEAT_LOCK_SHOW_PATTERN: (showId: string) => `${REDIS_CONFIG.SEAT_LOCK_KEY_PREFIX}:${showId}:*`,
  SEAT_EVENTS_CHANNEL: (showId: string) => `${REDIS_CONFIG.SEAT_EVENTS_CHANNEL_PREFIX}:${showId}`
} as const;

export type RedisConfig = typeof REDIS_CONFIG;
export type RedisKeyPatterns = typeof REDIS_KEY_PATTERNS;