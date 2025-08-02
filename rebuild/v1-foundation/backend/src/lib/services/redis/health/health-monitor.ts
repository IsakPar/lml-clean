/**
 * LML v1 Foundation - Redis Health Monitor
 * ========================================
 * Redis health checks and metrics collection
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';
import { REDIS_CONFIG } from '../config/constants';

// ================================================
// HEALTH CHECK INTERFACES
// ================================================

export interface RedisHealthResult {
  status: 'connected' | 'error';
  responseTime?: number;
  error?: string;
  memoryUsage?: string;
  connectedClients?: number;
  uptime?: number;
  version?: string;
}

export interface DetailedHealthMetrics {
  basic: RedisHealthResult;
  memory: MemoryMetrics;
  performance: PerformanceMetrics;
  clients: ClientMetrics;
}

export interface MemoryMetrics {
  usedMemoryHuman: string;
  usedMemoryBytes: number;
  maxMemoryBytes?: number;
  memoryFragmentationRatio?: number;
}

export interface PerformanceMetrics {
  commandsProcessed: number;
  commandsPerSecond: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number;
}

export interface ClientMetrics {
  connectedClients: number;
  clientLongestOutputList: number;
  clientBiggestInputBuf: number;
  blockedClients: number;
}

// ================================================
// BASIC HEALTH CHECK
// ================================================

export async function performBasicHealthCheck(client: Redis): Promise<RedisHealthResult> {
  const startTime = Date.now();

  try {
    // Test basic connectivity
    const pingResult = await client.ping();
    if (pingResult !== 'PONG') {
      throw new Error(`Unexpected ping response: ${pingResult}`);
    }

    const responseTime = Date.now() - startTime;

    // Get basic server info
    const [memoryInfo, clientsInfo, serverInfo] = await Promise.all([
      client.info(REDIS_CONFIG.INFO_COMMANDS.MEMORY),
      client.info(REDIS_CONFIG.INFO_COMMANDS.CLIENTS),
      client.info('server'),
    ]);

    // Parse memory usage
    const memoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';

    // Parse connected clients
    const clientsMatch = clientsInfo.match(/connected_clients:(\d+)/);
    const connectedClients = clientsMatch ? parseInt(clientsMatch[1], 10) : 0;

    // Parse uptime
    const uptimeMatch = serverInfo.match(/uptime_in_seconds:(\d+)/);
    const uptime = uptimeMatch ? parseInt(uptimeMatch[1], 10) : undefined;

    // Parse version
    const versionMatch = serverInfo.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : undefined;

    return {
      status: 'connected',
      responseTime,
      memoryUsage,
      connectedClients,
      uptime,
      version,
    };

  } catch (error) {
    console.error('Redis health check failed:', error);

    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ================================================
// DETAILED HEALTH METRICS
// ================================================

export async function performDetailedHealthCheck(client: Redis): Promise<DetailedHealthMetrics> {
  const [basic, memoryInfo, statsInfo, clientsInfo] = await Promise.all([
    performBasicHealthCheck(client),
    client.info('memory'),
    client.info('stats'),
    client.info('clients'),
  ]);

  const memory = parseMemoryMetrics(memoryInfo);
  const performance = parsePerformanceMetrics(statsInfo);
  const clients = parseClientMetrics(clientsInfo);

  return {
    basic,
    memory,
    performance,
    clients,
  };
}

// ================================================
// METRICS PARSING
// ================================================

function parseMemoryMetrics(info: string): MemoryMetrics {
  const usedMemoryMatch = info.match(/used_memory:(\d+)/);
  const usedMemoryHumanMatch = info.match(/used_memory_human:([^\r\n]+)/);
  const maxMemoryMatch = info.match(/maxmemory:(\d+)/);
  const fragmentationMatch = info.match(/mem_fragmentation_ratio:(\d+\.?\d*)/);

  return {
    usedMemoryHuman: usedMemoryHumanMatch ? usedMemoryHumanMatch[1] : 'unknown',
    usedMemoryBytes: usedMemoryMatch ? parseInt(usedMemoryMatch[1], 10) : 0,
    maxMemoryBytes: maxMemoryMatch ? parseInt(maxMemoryMatch[1], 10) : undefined,
    memoryFragmentationRatio: fragmentationMatch ? parseFloat(fragmentationMatch[1]) : undefined,
  };
}

function parsePerformanceMetrics(info: string): PerformanceMetrics {
  const commandsMatch = info.match(/total_commands_processed:(\d+)/);
  const opsPerSecMatch = info.match(/instantaneous_ops_per_sec:(\d+)/);
  const hitsMatch = info.match(/keyspace_hits:(\d+)/);
  const missesMatch = info.match(/keyspace_misses:(\d+)/);

  const hits = hitsMatch ? parseInt(hitsMatch[1], 10) : 0;
  const misses = missesMatch ? parseInt(missesMatch[1], 10) : 0;
  const total = hits + misses;
  const hitRate = total > 0 ? hits / total : 0;

  return {
    commandsProcessed: commandsMatch ? parseInt(commandsMatch[1], 10) : 0,
    commandsPerSecond: opsPerSecMatch ? parseInt(opsPerSecMatch[1], 10) : 0,
    keyspaceHits: hits,
    keyspaceMisses: misses,
    hitRate,
  };
}

function parseClientMetrics(info: string): ClientMetrics {
  const connectedMatch = info.match(/connected_clients:(\d+)/);
  const longestOutputMatch = info.match(/client_longest_output_list:(\d+)/);
  const biggestInputMatch = info.match(/client_biggest_input_buf:(\d+)/);
  const blockedMatch = info.match(/blocked_clients:(\d+)/);

  return {
    connectedClients: connectedMatch ? parseInt(connectedMatch[1], 10) : 0,
    clientLongestOutputList: longestOutputMatch ? parseInt(longestOutputMatch[1], 10) : 0,
    clientBiggestInputBuf: biggestInputMatch ? parseInt(biggestInputMatch[1], 10) : 0,
    blockedClients: blockedMatch ? parseInt(blockedMatch[1], 10) : 0,
  };
}

// ================================================
// HEALTH MONITORING
// ================================================

export function analyzeHealthMetrics(metrics: DetailedHealthMetrics): {
  overallHealth: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check basic connectivity
  if (metrics.basic.status === 'error') {
    issues.push('Redis connection failed');
    return { overallHealth: 'critical', issues, recommendations };
  }

  // Check response time
  if (metrics.basic.responseTime && metrics.basic.responseTime > 100) {
    issues.push(`High response time: ${metrics.basic.responseTime}ms`);
    recommendations.push('Check network latency and Redis server load');
  }

  // Check memory usage
  if (metrics.memory.memoryFragmentationRatio && metrics.memory.memoryFragmentationRatio > 1.5) {
    issues.push(`High memory fragmentation: ${metrics.memory.memoryFragmentationRatio}`);
    recommendations.push('Consider Redis restart or memory optimization');
  }

  // Check hit rate
  if (metrics.performance.hitRate < 0.8 && metrics.performance.keyspaceHits > 1000) {
    issues.push(`Low cache hit rate: ${(metrics.performance.hitRate * 100).toFixed(1)}%`);
    recommendations.push('Review caching strategy and TTL settings');
  }

  // Check client connections
  if (metrics.clients.connectedClients > 100) {
    issues.push(`High client count: ${metrics.clients.connectedClients}`);
    recommendations.push('Monitor connection pooling and implement connection limits');
  }

  // Determine overall health
  const overallHealth = issues.length === 0 ? 'healthy' : issues.some(issue => 
    issue.includes('connection failed') || 
    issue.includes('fragmentation') || 
    issue.includes('High client count')
  ) ? 'critical' : 'warning';

  return { overallHealth, issues, recommendations };
}