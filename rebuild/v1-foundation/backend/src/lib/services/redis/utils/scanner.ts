/**
 * LML v1 Foundation - Redis SCAN Utilities
 * =========================================
 * SCAN-based pattern matching (replaces dangerous KEYS command)
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';
import { REDIS_CONFIG } from '../config/constants';

// ================================================
// SCAN-BASED PATTERN MATCHING
// ================================================

export interface ScanOptions {
  pattern: string;
  batchSize?: number;
  maxIterations?: number;
}

export interface ScanResult {
  keys: string[];
  totalScanned: number;
  iterations: number;
  completed: boolean;
}

/**
 * Scan Redis keys using SCAN command (production-safe alternative to KEYS)
 */
export async function scanPattern(
  client: Redis,
  options: ScanOptions
): Promise<ScanResult> {
  const {
    pattern,
    batchSize = REDIS_CONFIG.SCAN_BATCH_SIZE,
    maxIterations = REDIS_CONFIG.MAX_SCAN_ITERATIONS
  } = options;

  const keys: string[] = [];
  let cursor = '0';
  let iterations = 0;
  let totalScanned = 0;

  try {
    do {
      iterations++;
      
      // Use SCAN with pattern matching
      const [nextCursor, batchKeys] = await client.scan(
        cursor,
        'MATCH', pattern,
        'COUNT', batchSize
      );

      cursor = nextCursor;
      totalScanned += batchKeys.length;
      keys.push(...batchKeys);

      // Safety valve: prevent infinite loops
      if (iterations >= maxIterations) {
        console.warn(`⚠️ SCAN reached max iterations (${maxIterations}) for pattern: ${pattern}`);
        break;
      }

    } while (cursor !== '0');

    return {
      keys,
      totalScanned,
      iterations,
      completed: cursor === '0'
    };

  } catch (error) {
    console.error('❌ SCAN operation failed:', error);
    throw new Error(`SCAN failed for pattern "${pattern}": ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ================================================
// SPECIALIZED SCAN OPERATIONS
// ================================================

/**
 * Scan for seat lock keys in a specific show
 */
export async function scanSeatLocks(
  client: Redis,
  showId: string,
  options?: Partial<ScanOptions>
): Promise<ScanResult> {
  return scanPattern(client, {
    pattern: `seat_lock:${showId}:*`,
    ...options
  });
}

/**
 * Scan for keys with TTL information
 */
export async function scanWithTTL(
  client: Redis,
  options: ScanOptions
): Promise<Array<{ key: string; ttl: number }>> {
  const scanResult = await scanPattern(client, options);
  const keysWithTTL = [];

  // Batch TTL requests for efficiency
  const ttlPromises = scanResult.keys.map(key => client.ttl(key));
  const ttls = await Promise.all(ttlPromises);

  for (let i = 0; i < scanResult.keys.length; i++) {
    const key = scanResult.keys[i];
    const ttl = ttls[i];
    
    // Only include keys with valid TTL (> 0)
    if (ttl > 0) {
      keysWithTTL.push({ key, ttl });
    }
  }

  return keysWithTTL;
}

// ================================================
// SCAN PERFORMANCE MONITORING
// ================================================

export interface ScanMetrics {
  pattern: string;
  keysFound: number;
  totalScanned: number;
  iterations: number;
  durationMs: number;
  completed: boolean;
  efficiency: number; // keysFound / totalScanned
}

/**
 * Monitor SCAN performance and efficiency
 */
export async function scanWithMetrics(
  client: Redis,
  options: ScanOptions
): Promise<{ result: ScanResult; metrics: ScanMetrics }> {
  const startTime = Date.now();
  
  const result = await scanPattern(client, options);
  
  const durationMs = Date.now() - startTime;
  const efficiency = result.totalScanned > 0 ? result.keys.length / result.totalScanned : 0;

  const metrics: ScanMetrics = {
    pattern: options.pattern,
    keysFound: result.keys.length,
    totalScanned: result.totalScanned,
    iterations: result.iterations,
    durationMs,
    completed: result.completed,
    efficiency
  };

  // Log performance warnings
  if (efficiency < 0.1 && result.keys.length > 0) {
    console.warn(`⚠️ SCAN efficiency low (${(efficiency * 100).toFixed(1)}%) for pattern: ${options.pattern}`);
  }

  if (durationMs > 1000) {
    console.warn(`⚠️ SCAN took ${durationMs}ms for pattern: ${options.pattern}`);
  }

  return { result, metrics };
}