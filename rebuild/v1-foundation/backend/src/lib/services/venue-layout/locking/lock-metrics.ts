/**
 * LML v1 Foundation - Seat Lock Observability & Metrics
 * =====================================================
 * Enterprise-grade metrics collection for lock operations
 * Prometheus-compatible format for production monitoring
 * Created: 2025-08-05
 * Status: Phase 2B - Production Observability
 */

import { getVenueLayoutServiceConfig } from '../config/service-config';

// ================================================
// METRICS STORAGE
// ================================================

interface LockMetricPoint {
  timestamp: number;
  seatId: string;
  userId: string;
  value: number;
  tags?: Record<string, string>;
}

interface LockMetricSummary {
  count: number;
  totalDuration: number;
  avgDuration: number;
  recent: LockMetricPoint[];
}

const lockMetrics: Map<string, LockMetricSummary> = new Map();
const MAX_RECENT_POINTS = 100;

// ================================================
// CORE METRICS FUNCTIONS
// ================================================

/**
 * Record a lock operation metric
 */
function recordLockMetric(
  metricName: string, 
  seatId: string, 
  userId: string, 
  value: number, 
  tags?: Record<string, string>
): void {
  const config = getVenueLayoutServiceConfig();
  if (!config.metrics.enabled) return;

  const existing = lockMetrics.get(metricName) || {
    count: 0,
    totalDuration: 0,
    avgDuration: 0,
    recent: [],
  };

  existing.count++;
  existing.totalDuration += value;
  existing.avgDuration = existing.totalDuration / existing.count;

  // Store recent values
  const point: LockMetricPoint = {
    timestamp: Date.now(),
    seatId,
    userId,
    value,
    tags,
  };

  existing.recent.push(point);
  if (existing.recent.length > MAX_RECENT_POINTS) {
    existing.recent.shift();
  }

  lockMetrics.set(metricName, existing);

  // Log important metrics (development only)
  if (process.env.NODE_ENV === 'development') {
    const tagsStr = tags ? ` (${JSON.stringify(tags)})` : '';
    console.log(`🔒 Lock Metric: ${metricName} = ${value} [${seatId}:${userId}]${tagsStr}`);
  }
}

/**
 * Increment a lock counter metric
 */
function incrementLockMetric(
  metricName: string, 
  seatId: string, 
  userId: string, 
  tags?: Record<string, string>
): void {
  recordLockMetric(metricName, seatId, userId, 1, tags);
}

// ================================================
// LOCK ACQUISITION METRICS
// ================================================

/**
 * Record successful lock acquisition
 */
export function recordLockAcquisition(seatId: string, userId: string, ttlMs: number): void {
  incrementLockMetric('lock.acquisition.success', seatId, userId, { ttl: ttlMs.toString() });
  recordLockMetric('lock.acquisition.ttl', seatId, userId, ttlMs);
}

/**
 * Record lock acquisition failure
 */
export function recordLockFailure(seatId: string, userId: string, reason: string): void {
  incrementLockMetric('lock.acquisition.failure', seatId, userId, { reason });
}

/**
 * Record lock acquisition duration
 */
export function recordLockAcquisitionDuration(seatId: string, userId: string, durationMs: number): void {
  recordLockMetric('lock.acquisition.duration', seatId, userId, durationMs);
}

// ================================================
// LOCK RELEASE METRICS
// ================================================

/**
 * Record successful lock release
 */
export function recordLockRelease(seatId: string, userId: string): void {
  incrementLockMetric('lock.release.success', seatId, userId);
}

/**
 * Record lock release failure
 */
export function recordLockReleaseFailure(seatId: string, userId: string, reason: string): void {
  incrementLockMetric('lock.release.failure', seatId, userId, { reason });
}

/**
 * Record lock held duration (from acquisition to release)
 */
export function recordLockHeldDuration(seatId: string, userId: string, durationMs: number): void {
  recordLockMetric('lock.held.duration', seatId, userId, durationMs);
}

// ================================================
// LOCK EXPIRY & CLEANUP METRICS
// ================================================

/**
 * Record lock expiry (TTL reached)
 */
export function recordLockExpiry(seatId: string): void {
  incrementLockMetric('lock.expiry.ttl', seatId, 'system');
}

/**
 * Record lock cleanup operation
 */
export function recordLockCleanup(cleanedCount: number): void {
  recordLockMetric('lock.cleanup.count', 'system', 'system', cleanedCount);
}

// ================================================
// CONFLICT & CONTENTION METRICS
// ================================================

/**
 * Record lock conflict (multiple users trying same seat)
 */
export function recordLockConflict(seatId: string, requestingUserId: string, holdingUserId: string): void {
  incrementLockMetric('lock.conflicts_total', seatId, requestingUserId, { 
    holder: holdingUserId,
    contention: 'high'
  });
}

/**
 * Record lock contention level
 */
export function recordLockContention(seatId: string, attemptCount: number): void {
  const contentionLevel = attemptCount > 5 ? 'high' : attemptCount > 2 ? 'medium' : 'low';
  recordLockMetric('lock.contention.level', seatId, 'system', attemptCount, { 
    level: contentionLevel 
  });
}

export function recordBatchSize(size: number): void {
  recordLockMetric('seat_lock_batch_size', 'system', 'system', size);
}

// ================================================
// REDIS CONNECTION METRICS
// ================================================

/**
 * Record Redis operation success
 */
export function recordRedisOperationSuccess(operation: string, durationMs: number): void {
  recordLockMetric(`redis.operation.${operation}.success`, 'system', 'system', durationMs);
}

/**
 * Record Redis operation failure
 */
export function recordRedisOperationFailure(operation: string, error: string): void {
  incrementLockMetric(`redis.operation.${operation}.failure`, 'system', 'system', { error });
}

/**
 * Record Redis connection health
 */
export function recordRedisConnectionHealth(isHealthy: boolean, latencyMs?: number): void {
  incrementLockMetric('redis.connection.health', 'system', 'system', { 
    status: isHealthy ? 'healthy' : 'unhealthy' 
  });
  
  if (latencyMs) {
    recordLockMetric('redis.connection.latency', 'system', 'system', latencyMs);
  }
}

// ================================================
// BUSINESS METRICS
// ================================================

/**
 * Record successful seat reservation (lock → paid)
 */
export function recordSeatReservationSuccess(seatId: string, userId: string, totalDurationMs: number): void {
  recordLockMetric('business.reservation.success', seatId, userId, totalDurationMs);
}

/**
 * Record failed seat reservation (lock → timeout/abandoned)
 */
export function recordSeatReservationFailure(seatId: string, userId: string, reason: string): void {
  incrementLockMetric('business.reservation.failure', seatId, userId, { reason });
}

/**
 * Record average time from lock to payment
 */
export function recordLockToPaymentDuration(seatId: string, userId: string, durationMs: number): void {
  recordLockMetric('business.lock_to_payment.duration', seatId, userId, durationMs);
}

// ================================================
// METRICS EXPORT & MONITORING
// ================================================

/**
 * Get all lock metrics for monitoring dashboard
 */
export function getAllLockMetrics(): Record<string, LockMetricSummary> {
  return Object.fromEntries(lockMetrics.entries());
}

/**
 * Get specific lock metric
 */
export function getLockMetric(metricName: string): LockMetricSummary | undefined {
  return lockMetrics.get(metricName);
}

/**
 * Get Prometheus-compatible metrics format
 */
export function getPrometheusMetrics(): string[] {
  const prometheusLines: string[] = [];
  
  for (const [metricName, summary] of lockMetrics.entries()) {
    const sanitizedName = metricName.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Counter metrics
    prometheusLines.push(`# TYPE lml_${sanitizedName}_total counter`);
    prometheusLines.push(`lml_${sanitizedName}_total ${summary.count}`);
    
    // Gauge metrics for averages
    if (summary.avgDuration > 0) {
      prometheusLines.push(`# TYPE lml_${sanitizedName}_avg gauge`);
      prometheusLines.push(`lml_${sanitizedName}_avg ${summary.avgDuration.toFixed(2)}`);
    }
  }
  
  return prometheusLines;
}

/**
 * Get metrics for operations dashboard
 */
export function getLockMetricsForDashboard(): {
  locks: {
    totalAcquisitions: number;
    successRate: number;
    avgHeldDuration: number;
    currentConflicts: number;
  };
  redis: {
    operationSuccessRate: number;
    avgLatency: number;
    connectionHealth: string;
  };
  business: {
    reservationSuccessRate: number;
    avgLockToPaymentTime: number;
    totalRevenue: number; // Placeholder for future integration
  };
} {
  const acquisitions = lockMetrics.get('lock.acquisition.success')?.count || 0;
  const failures = lockMetrics.get('lock.acquisition.failure')?.count || 0;
  const totalAttempts = acquisitions + failures;
  
  const heldDuration = lockMetrics.get('lock.held.duration')?.avgDuration || 0;
  const conflicts = lockMetrics.get('lock.conflict')?.count || 0;
  
  const redisSuccess = lockMetrics.get('redis.operation.set.success')?.count || 0;
  const redisFailure = lockMetrics.get('redis.operation.set.failure')?.count || 0;
  const redisTotal = redisSuccess + redisFailure;
  
  const redisLatency = lockMetrics.get('redis.connection.latency')?.avgDuration || 0;
  
  const reservationSuccess = lockMetrics.get('business.reservation.success')?.count || 0;
  const reservationFailure = lockMetrics.get('business.reservation.failure')?.count || 0;
  const reservationTotal = reservationSuccess + reservationFailure;
  
  const lockToPayment = lockMetrics.get('business.lock_to_payment.duration')?.avgDuration || 0;
  
  return {
    locks: {
      totalAcquisitions: acquisitions,
      successRate: totalAttempts > 0 ? acquisitions / totalAttempts : 1,
      avgHeldDuration: heldDuration,
      currentConflicts: conflicts,
    },
    redis: {
      operationSuccessRate: redisTotal > 0 ? redisSuccess / redisTotal : 1,
      avgLatency: redisLatency,
      connectionHealth: redisLatency < 10 ? 'excellent' : redisLatency < 50 ? 'good' : 'degraded',
    },
    business: {
      reservationSuccessRate: reservationTotal > 0 ? reservationSuccess / reservationTotal : 1,
      avgLockToPaymentTime: lockToPayment,
      totalRevenue: 0, // TODO: Integrate with payment service
    },
  };
}

/**
 * Reset all metrics (for testing)
 */
export function resetLockMetrics(): void {
  lockMetrics.clear();
  console.log('🔄 Lock metrics reset');
}

export function recordOrdersTxnLockWaitMs(value: number, tags?: Record<string, string>): void {
  recordLockMetric('orders_txn_lock_wait_ms', 'system', 'system', value, tags);
}

// ================================================
// REAL-TIME ALERTING
// ================================================

/**
 * Check for concerning metric patterns and alert
 */
export function checkLockMetricAlerts(): string[] {
  const alerts: string[] = [];
  const dashboard = getLockMetricsForDashboard();
  
  // High conflict rate
  if (dashboard.locks.currentConflicts > 50) {
    alerts.push(`🚨 HIGH LOCK CONTENTION: ${dashboard.locks.currentConflicts} conflicts detected`);
  }
  
  // Low success rate
  if (dashboard.locks.successRate < 0.95) {
    alerts.push(`🚨 LOW LOCK SUCCESS RATE: ${(dashboard.locks.successRate * 100).toFixed(1)}%`);
  }
  
  // Redis performance issues
  if (dashboard.redis.avgLatency > 100) {
    alerts.push(`🚨 HIGH REDIS LATENCY: ${dashboard.redis.avgLatency.toFixed(1)}ms`);
  }
  
  // Business impact
  if (dashboard.business.reservationSuccessRate < 0.90) {
    alerts.push(`🚨 LOW RESERVATION SUCCESS: ${(dashboard.business.reservationSuccessRate * 100).toFixed(1)}%`);
  }
  
  return alerts;
}

/**
 * Get lock health score (0-100)
 */
export function getLockHealthScore(): number {
  const dashboard = getLockMetricsForDashboard();
  
  let score = 100;
  
  // Deduct points for issues
  if (dashboard.locks.successRate < 0.99) score -= 20;
  if (dashboard.redis.operationSuccessRate < 0.99) score -= 20;
  if (dashboard.business.reservationSuccessRate < 0.95) score -= 30;
  if (dashboard.redis.avgLatency > 50) score -= 15;
  if (dashboard.locks.currentConflicts > 20) score -= 15;
  
  return Math.max(0, score);
}