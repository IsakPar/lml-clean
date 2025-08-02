/**
 * LML v1 Foundation - Redis Connection Statistics
 * ===============================================
 * Connection pool statistics and monitoring
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { RedisConnectionPool } from '../connection/connection-pool';
import { getRedisEventMetrics, analyzeConnectionHealth } from '../connection/event-handlers';

// ================================================
// CONNECTION STATISTICS INTERFACES
// ================================================

export interface ConnectionPoolStats {
  overall: {
    isConnected: boolean;
    connectionAttempts: number;
    healthScore: number; // 0-100
  };
  clients: {
    main: ClientConnectionStats;
    subscriber: ClientConnectionStats;
    publisher: ClientConnectionStats;
  };
  events: {
    totalConnections: number;
    totalDisconnections: number;
    totalErrors: number;
    totalReconnections: number;
  };
}

export interface ClientConnectionStats {
  status: string;
  isHealthy: boolean;
  connectionCount: number;
  errorCount: number;
  reconnectionCount: number;
  lastEventTime?: Date;
  issues: string[];
}

// ================================================
// STATISTICS COLLECTION
// ================================================

export function collectConnectionStats(pool: RedisConnectionPool): ConnectionPoolStats {
  const poolStats = pool.getConnectionStats();
  const allEventMetrics = getRedisEventMetrics();

  // Analyze health for each client
  const mainHealth = analyzeConnectionHealth('main');
  const subscriberHealth = analyzeConnectionHealth('subscriber');
  const publisherHealth = analyzeConnectionHealth('publisher');

  // Calculate overall health score
  const healthScore = calculateOverallHealthScore([
    mainHealth.isHealthy,
    subscriberHealth.isHealthy,
    publisherHealth.isHealthy,
  ]);

  // Aggregate event statistics
  const eventTotals = allEventMetrics.reduce(
    (totals, metrics) => ({
      totalConnections: totals.totalConnections + metrics.connectionCount,
      totalDisconnections: totals.totalDisconnections + metrics.disconnectionCount,
      totalErrors: totals.totalErrors + metrics.errorCount,
      totalReconnections: totals.totalReconnections + metrics.reconnectionCount,
    }),
    { totalConnections: 0, totalDisconnections: 0, totalErrors: 0, totalReconnections: 0 }
  );

  return {
    overall: {
      isConnected: poolStats.isConnected,
      connectionAttempts: poolStats.connectionAttempts,
      healthScore,
    },
    clients: {
      main: createClientStats('main', poolStats.mainStatus, mainHealth),
      subscriber: createClientStats('subscriber', poolStats.subscriberStatus, subscriberHealth),
      publisher: createClientStats('publisher', poolStats.publisherStatus, publisherHealth),
    },
    events: eventTotals,
  };
}

// ================================================
// HELPER FUNCTIONS
// ================================================

function createClientStats(
  role: string,
  status: string,
  health: ReturnType<typeof analyzeConnectionHealth>
): ClientConnectionStats {
  return {
    status,
    isHealthy: health.isHealthy,
    connectionCount: health.metrics?.connectionCount || 0,
    errorCount: health.metrics?.errorCount || 0,
    reconnectionCount: health.metrics?.reconnectionCount || 0,
    lastEventTime: health.metrics?.lastEventTime,
    issues: health.issues,
  };
}

function calculateOverallHealthScore(healthyStates: boolean[]): number {
  const healthyCount = healthyStates.filter(Boolean).length;
  const totalCount = healthyStates.length;
  return totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 0;
}

// ================================================
// STATISTICS FORMATTING
// ================================================

export function formatConnectionStats(stats: ConnectionPoolStats): {
  summary: string;
  details: Record<string, any>;
  alerts: string[];
} {
  const { overall, clients, events } = stats;
  
  const alerts: string[] = [];
  
  // Check for alerts
  if (!overall.isConnected) {
    alerts.push('Connection pool is disconnected');
  }
  
  if (overall.healthScore < 100) {
    alerts.push(`Health score is ${overall.healthScore}% (some clients unhealthy)`);
  }
  
  if (events.totalErrors > 10) {
    alerts.push(`High error count: ${events.totalErrors} total errors`);
  }
  
  if (events.totalReconnections > 5) {
    alerts.push(`Frequent reconnections: ${events.totalReconnections} total reconnections`);
  }

  // Client-specific alerts
  Object.entries(clients).forEach(([role, client]) => {
    if (!client.isHealthy) {
      alerts.push(`${role} client unhealthy: ${client.issues.join(', ')}`);
    }
  });

  const summary = `Redis Pool: ${overall.isConnected ? 'Connected' : 'Disconnected'} | ` +
    `Health: ${overall.healthScore}% | ` +
    `Errors: ${events.totalErrors} | ` +
    `Reconnections: ${events.totalReconnections}`;

  const details = {
    connection_pool: {
      status: overall.isConnected ? 'connected' : 'disconnected',
      health_score: overall.healthScore,
      connection_attempts: overall.connectionAttempts,
    },
    clients: {
      main: formatClientDetails(clients.main),
      subscriber: formatClientDetails(clients.subscriber),
      publisher: formatClientDetails(clients.publisher),
    },
    events: events,
  };

  return { summary, details, alerts };
}

function formatClientDetails(client: ClientConnectionStats): Record<string, any> {
  return {
    status: client.status,
    healthy: client.isHealthy,
    connections: client.connectionCount,
    errors: client.errorCount,
    reconnections: client.reconnectionCount,
    last_event: client.lastEventTime?.toISOString(),
    issues: client.issues,
  };
}

// ================================================
// MONITORING UTILITIES
// ================================================

export function isConnectionPoolHealthy(stats: ConnectionPoolStats): boolean {
  return stats.overall.isConnected && 
         stats.overall.healthScore >= 100 && 
         stats.events.totalErrors < 10;
}

export function getUnhealthyClients(stats: ConnectionPoolStats): string[] {
  return Object.entries(stats.clients)
    .filter(([, client]) => !client.isHealthy)
    .map(([role]) => role);
}

export function getConnectionPoolAlerts(stats: ConnectionPoolStats): string[] {
  const { alerts } = formatConnectionStats(stats);
  return alerts;
}