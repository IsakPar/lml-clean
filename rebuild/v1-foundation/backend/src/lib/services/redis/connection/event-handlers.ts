/**
 * LML v1 Foundation - Redis Event Handlers
 * =========================================
 * Redis connection event management
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';

// ================================================
// EVENT HANDLER TYPES
// ================================================

export type ConnectionStateCallback = (role: string, connected: boolean) => void;

export interface RedisEventMetrics {
  role: string;
  connectionCount: number;
  disconnectionCount: number;
  errorCount: number;
  reconnectionCount: number;
  lastEventTime: Date;
}

// ================================================
// EVENT METRICS TRACKING
// ================================================

const eventMetrics = new Map<string, RedisEventMetrics>();

function updateMetrics(role: string, eventType: string): void {
  const metrics = eventMetrics.get(role) || {
    role,
    connectionCount: 0,
    disconnectionCount: 0,
    errorCount: 0,
    reconnectionCount: 0,
    lastEventTime: new Date(),
  };

  switch (eventType) {
    case 'connect':
      metrics.connectionCount++;
      break;
    case 'close':
    case 'end':
      metrics.disconnectionCount++;
      break;
    case 'error':
      metrics.errorCount++;
      break;
    case 'reconnecting':
      metrics.reconnectionCount++;
      break;
  }

  metrics.lastEventTime = new Date();
  eventMetrics.set(role, metrics);
}

// ================================================
// REDIS EVENT HANDLERS
// ================================================

export function setupRedisEventHandlers(
  client: Redis,
  role: string,
  onStateChange?: ConnectionStateCallback
): void {
  // Connection established
  client.on('connect', () => {
    console.log(`🔗 Redis ${role} client connected`);
    updateMetrics(role, 'connect');
    onStateChange?.(role, true);
  });

  // Client ready for commands
  client.on('ready', () => {
    console.log(`✅ Redis ${role} client ready`);
    onStateChange?.(role, true);
  });

  // Connection error
  client.on('error', (error) => {
    console.error(`❌ Redis ${role} client error:`, error);
    updateMetrics(role, 'error');
    onStateChange?.(role, false);
  });

  // Connection closed
  client.on('close', () => {
    console.log(`🔌 Redis ${role} client connection closed`);
    updateMetrics(role, 'close');
    onStateChange?.(role, false);
  });

  // Reconnection attempt
  client.on('reconnecting', (ms: number) => {
    console.log(`🔄 Redis ${role} client reconnecting in ${ms}ms`);
    updateMetrics(role, 'reconnecting');
  });

  // Connection ended
  client.on('end', () => {
    console.log(`🛑 Redis ${role} client connection ended`);
    updateMetrics(role, 'end');
    onStateChange?.(role, false);
  });

  // Command execution
  client.on('select', (db) => {
    console.log(`📋 Redis ${role} client selected database ${db}`);
  });
}

// ================================================
// METRICS ACCESS
// ================================================

export function getRedisEventMetrics(role?: string): RedisEventMetrics[] {
  if (role) {
    const metrics = eventMetrics.get(role);
    return metrics ? [metrics] : [];
  }
  
  return Array.from(eventMetrics.values());
}

export function resetRedisEventMetrics(role?: string): void {
  if (role) {
    eventMetrics.delete(role);
  } else {
    eventMetrics.clear();
  }
}

// ================================================
// ERROR ANALYSIS
// ================================================

export function analyzeConnectionHealth(role: string): {
  isHealthy: boolean;
  issues: string[];
  metrics: RedisEventMetrics | null;
} {
  const metrics = eventMetrics.get(role);
  const issues: string[] = [];
  
  if (!metrics) {
    return {
      isHealthy: false,
      issues: ['No metrics available'],
      metrics: null,
    };
  }

  // Check error rate
  const totalEvents = metrics.connectionCount + metrics.disconnectionCount + metrics.errorCount;
  if (totalEvents > 0) {
    const errorRate = metrics.errorCount / totalEvents;
    if (errorRate > 0.1) { // 10% error rate threshold
      issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
  }

  // Check reconnection frequency
  if (metrics.reconnectionCount > 5) {
    issues.push(`Excessive reconnections: ${metrics.reconnectionCount}`);
  }

  // Check recent activity
  const timeSinceLastEvent = Date.now() - metrics.lastEventTime.getTime();
  if (timeSinceLastEvent > 300000) { // 5 minutes
    issues.push('No recent activity');
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    metrics,
  };
}