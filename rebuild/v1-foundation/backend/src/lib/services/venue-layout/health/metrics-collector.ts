/**
 * LML v1 Foundation - Layout Service Metrics Collector
 * ====================================================
 * Performance and observability metrics for enterprise monitoring
 * Created: 2025-08-05
 * Status: Phase 1 - Core Architecture (Fix #4: Observability)
 */

import { getVenueLayoutServiceConfig } from '../config/service-config';

// ================================================
// METRICS STORAGE
// ================================================

interface MetricPoint {
  timestamp: number;
  value: number;
  tags?: Record<string, string>;
}

interface MetricSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  recent: MetricPoint[];
}

const metrics: Map<string, MetricSummary> = new Map();
const MAX_RECENT_POINTS = 100;

// ================================================
// CORE METRICS FUNCTIONS
// ================================================

/**
 * Record a metric value
 */
function recordMetric(name: string, value: number, tags?: Record<string, string>): void {
  const config = getVenueLayoutServiceConfig();
  if (!config.metrics.enabled) return;

  const existing = metrics.get(name) || {
    count: 0,
    sum: 0,
    min: Infinity,
    max: -Infinity,
    avg: 0,
    recent: [],
  };

  existing.count++;
  existing.sum += value;
  existing.min = Math.min(existing.min, value);
  existing.max = Math.max(existing.max, value);
  existing.avg = existing.sum / existing.count;

  // Store recent values
  const point: MetricPoint = {
    timestamp: Date.now(),
    value,
    tags,
  };

  existing.recent.push(point);
  if (existing.recent.length > MAX_RECENT_POINTS) {
    existing.recent.shift();
  }

  metrics.set(name, existing);

  // Log important metrics to console (development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 Metric: ${name} = ${value}${tags ? ` (${JSON.stringify(tags)})` : ''}`);
  }
}

/**
 * Increment a counter metric
 */
function incrementMetric(name: string, tags?: Record<string, string>): void {
  recordMetric(name, 1, tags);
}

// ================================================
// CACHE METRICS (Fix #4)
// ================================================

/**
 * Record layout cache hit
 */
export function recordLayoutCacheHit(venueId: string): void {
  incrementMetric('layout.cache.hit', { venue: venueId });
  incrementMetric('layout.cache.total');
}

/**
 * Record layout cache miss
 */
export function recordLayoutCacheMiss(venueId: string): void {
  incrementMetric('layout.cache.miss', { venue: venueId });
  incrementMetric('layout.cache.total');
}

/**
 * Record cache invalidation
 */
export function recordCacheInvalidation(venueId: string, reason: string): void {
  incrementMetric('layout.cache.invalidation', { venue: venueId, reason });
}

/**
 * Get cache hit rate
 */
export function getCacheHitRate(): number {
  const hits = metrics.get('layout.cache.hit')?.count || 0;
  const misses = metrics.get('layout.cache.miss')?.count || 0;
  const total = hits + misses;
  
  return total > 0 ? hits / total : 0;
}

// ================================================
// OPERATION METRICS (Fix #4)
// ================================================

/**
 * Record operation duration
 */
export function recordOperationDuration(operation: string, durationMs: number): void {
  recordMetric(`layout.operation.duration.${operation}`, durationMs);
  recordMetric('layout.operation.duration.all', durationMs);
}

/**
 * Record publish duration (Fix #4: Publish Metrics)
 */
export function recordPublishDuration(venueId: string, durationMs: number): void {
  recordMetric('layout.publish.duration', durationMs, { venue: venueId });
}

/**
 * Record CDN purge duration
 */
export function recordCDNPurgeDuration(venueId: string, durationMs: number): void {
  recordMetric('layout.cdn.purge.duration', durationMs, { venue: venueId });
}

/**
 * Record validation duration
 */
export function recordValidationDuration(layoutId: string, durationMs: number): void {
  recordMetric('layout.validation.duration', durationMs, { layout: layoutId });
}

// ================================================
// BUSINESS METRICS
// ================================================

/**
 * Record layout creation
 */
export function recordLayoutCreation(venueId: string, layoutType: string): void {
  incrementMetric('layout.created', { venue: venueId, type: layoutType });
}

/**
 * Record layout update
 */
export function recordLayoutUpdate(venueId: string, updateType: string): void {
  incrementMetric('layout.updated', { venue: venueId, updateType });
}

/**
 * Record layout publish
 */
export function recordLayoutPublish(venueId: string, version: string): void {
  incrementMetric('layout.published', { venue: venueId, version });
}

/**
 * Record validation failure
 */
export function recordValidationFailure(venueId: string, errorType: string): void {
  incrementMetric('layout.validation.failure', { venue: venueId, errorType });
}

// ================================================
// PREDICTIVE CACHING METRICS (Fix #6)
// ================================================

/**
 * Record predictive cache warm
 */
export function recordPredictiveCacheWarm(venueId: string, userId: string): void {
  incrementMetric('layout.cache.predictive.warm', { venue: venueId, user: userId });
}

/**
 * Record predictive cache hit (cache was warm when needed)
 */
export function recordPredictiveCacheSuccess(venueId: string): void {
  incrementMetric('layout.cache.predictive.success', { venue: venueId });
}

// ================================================
// ERROR TRACKING
// ================================================

/**
 * Record error by type
 */
export function recordError(errorType: string, operation: string, details?: any): void {
  incrementMetric('layout.error', { type: errorType, operation });
  
  // Log error details in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`🚨 Layout Service Error [${errorType}] in ${operation}:`, details);
  }
}

/**
 * Record database operation error
 */
export function recordDatabaseError(operation: string, error: Error): void {
  recordError('database', operation, error.message);
}

/**
 * Record cache operation error
 */
export function recordCacheError(operation: string, error: Error): void {
  recordError('cache', operation, error.message);
}

// ================================================
// METRICS EXPORT
// ================================================

/**
 * Get all metrics summary
 */
export function getAllMetrics(): Record<string, MetricSummary> {
  return Object.fromEntries(metrics.entries());
}

/**
 * Get specific metric
 */
export function getMetric(name: string): MetricSummary | undefined {
  return metrics.get(name);
}

/**
 * Get metrics for monitoring dashboard
 */
export function getMetricsForDashboard(): {
  cache: {
    hitRate: number;
    totalOperations: number;
    recentHits: number;
    recentMisses: number;
  };
  operations: {
    averageCreateTime: number;
    averageUpdateTime: number;
    averagePublishTime: number;
    totalOperations: number;
  };
  errors: {
    totalErrors: number;
    recentErrors: MetricPoint[];
    errorsByType: Record<string, number>;
  };
} {
  const cacheHits = metrics.get('layout.cache.hit')?.count || 0;
  const cacheMisses = metrics.get('layout.cache.miss')?.count || 0;
  const totalCacheOps = cacheHits + cacheMisses;

  return {
    cache: {
      hitRate: getCacheHitRate(),
      totalOperations: totalCacheOps,
      recentHits: cacheHits,
      recentMisses: cacheMisses,
    },
    operations: {
      averageCreateTime: metrics.get('layout.operation.duration.layout.create')?.avg || 0,
      averageUpdateTime: metrics.get('layout.operation.duration.layout.update')?.avg || 0,
      averagePublishTime: metrics.get('layout.publish.duration')?.avg || 0,
      totalOperations: metrics.get('layout.operation.duration.all')?.count || 0,
    },
    errors: {
      totalErrors: metrics.get('layout.error')?.count || 0,
      recentErrors: metrics.get('layout.error')?.recent || [],
      errorsByType: {
        database: metrics.get('layout.error')?.recent.filter(p => p.tags?.type === 'database').length || 0,
        cache: metrics.get('layout.error')?.recent.filter(p => p.tags?.type === 'cache').length || 0,
        validation: metrics.get('layout.error')?.recent.filter(p => p.tags?.type === 'validation').length || 0,
      },
    },
  };
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.clear();
  console.log('🔄 Layout service metrics reset');
}

// ================================================
// HEALTH CHECK METRICS
// ================================================

/**
 * Record service health check
 */
export function recordHealthCheck(healthy: boolean, checkDurationMs: number): void {
  recordMetric('layout.health.check.duration', checkDurationMs);
  incrementMetric(`layout.health.check.${healthy ? 'success' : 'failure'}`);
}

/**
 * Get service health metrics
 */
export function getHealthMetrics(): {
  isHealthy: boolean;
  uptime: number;
  totalChecks: number;
  successRate: number;
  averageResponseTime: number;
} {
  const successChecks = metrics.get('layout.health.check.success')?.count || 0;
  const failureChecks = metrics.get('layout.health.check.failure')?.count || 0;
  const totalChecks = successChecks + failureChecks;
  const avgResponseTime = metrics.get('layout.health.check.duration')?.avg || 0;

  return {
    isHealthy: totalChecks > 0 ? (successChecks / totalChecks) > 0.95 : true,
    uptime: Date.now() - (process.uptime() * 1000),
    totalChecks,
    successRate: totalChecks > 0 ? successChecks / totalChecks : 1,
    averageResponseTime: avgResponseTime,
  };
}