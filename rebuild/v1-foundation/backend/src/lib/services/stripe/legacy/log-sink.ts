// Production log sink for real-time monitoring and alerting
import { Redis } from 'ioredis';
import { Pool } from 'pg';

// Alert severity levels
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Alert categories for filtering and routing
export enum AlertCategory {
  PAYMENT = 'payment',
  REDIS = 'redis',
  DATABASE = 'database',
  BOOKING = 'booking',
  LAYOUT = 'layout',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
}

// Structured alert format
export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  metadata: {
    userId?: string;
    sessionId?: string;
    organizationId?: string;
    venueId?: string;
    eventId?: string;
    bookingId?: string;
    paymentIntentId?: string;
    seatId?: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    [key: string]: any;
  };
  context: {
    service: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    responseTime?: number;
    errorCode?: string;
    stackTrace?: string;
  };
  correlationId?: string;
  fingerprint: string; // For deduplication
  tags: string[];
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

// Alert configuration
interface AlertConfig {
  enableSlackNotifications: boolean;
  enableEmailNotifications: boolean;
  enableSMSNotifications: boolean;
  slackWebhookUrl?: string;
  emailRecipients: string[];
  smsRecipients: string[];
  dedupWindowMinutes: number;
  rateLimitPerMinute: number;
}

// Real-time alert manager
export class LogSink {
  private redis: Redis;
  private postgres: Pool;
  private config: AlertConfig;
  private alertBuffer: Alert[] = [];
  private dedupCache = new Map<string, number>();

  constructor(redis: Redis, postgres: Pool, config: Partial<AlertConfig> = {}) {
    this.redis = redis;
    this.postgres = postgres;
    this.config = {
      enableSlackNotifications: true,
      enableEmailNotifications: false,
      enableSMSNotifications: false,
      emailRecipients: [],
      smsRecipients: [],
      dedupWindowMinutes: 10,
      rateLimitPerMinute: 100,
      ...config,
    };
  }

  /**
   * Main alert method - logs and routes alerts appropriately
   */
  async alert(alertData: Partial<Alert>): Promise<void> {
    const alert = this.enrichAlert(alertData);
    
    // Check for deduplication
    if (this.isDuplicate(alert)) {
      return;
    }

    // Store alert
    await this.storeAlert(alert);

    // Route based on severity
    await this.routeAlert(alert);

    // Update metrics
    await this.updateAlertMetrics(alert);

    // Add to buffer for batch processing
    this.alertBuffer.push(alert);
    
    // Process buffer if it's getting full
    if (this.alertBuffer.length >= 10) {
      await this.flushAlertBuffer();
    }
  }

  /**
   * Stripe-specific alert helpers
   */
  async alertStripePaymentFailure(paymentIntentId: string, bookingId: string, error: any, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: AlertSeverity.HIGH,
      category: AlertCategory.PAYMENT,
      title: 'Stripe Payment Failure',
      message: `Payment intent ${paymentIntentId} failed for booking ${bookingId}`,
      metadata: {
        paymentIntentId,
        bookingId,
        stripeError: error.code || error.type,
        stripeMessage: error.message,
        amount: metadata.amount,
        currency: metadata.currency,
        ...metadata,
      },
      context: {
        service: 'stripe',
        errorCode: error.code,
      },
      tags: ['stripe', 'payment', 'failure'],
    });
  }

  async alertStripeWebhookFailure(webhookId: string, eventType: string, error: any, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: AlertSeverity.MEDIUM,
      category: AlertCategory.PAYMENT,
      title: 'Stripe Webhook Processing Failed',
      message: `Failed to process webhook ${webhookId} of type ${eventType}`,
      metadata: {
        webhookId,
        eventType,
        stripeError: error.message,
        retryCount: metadata.retryCount || 0,
        ...metadata,
      },
      context: {
        service: 'stripe-webhooks',
        errorCode: 'webhook_processing_failed',
      },
      tags: ['stripe', 'webhook', 'failure'],
    });
  }

  async alertStripeIdempotencyViolation(paymentIntentId: string, originalRequestId: string, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: AlertSeverity.CRITICAL,
      category: AlertCategory.PAYMENT,
      title: 'Stripe Idempotency Violation',
      message: `Duplicate payment intent creation attempted: ${paymentIntentId}`,
      metadata: {
        paymentIntentId,
        originalRequestId,
        duplicateAttemptTime: new Date().toISOString(),
        ...metadata,
      },
      context: {
        service: 'stripe',
        errorCode: 'idempotency_violation',
      },
      tags: ['stripe', 'idempotency', 'critical'],
    });
  }

  /**
   * Redis-specific alert helpers
   */
  async alertRedisConnectionFailure(error: any, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: AlertSeverity.HIGH,
      category: AlertCategory.REDIS,
      title: 'Redis Connection Failure',
      message: `Redis connection lost: ${error.message}`,
      metadata: {
        redisError: error.message,
        redisCode: error.code,
        connectionAttempts: metadata.retryCount || 0,
        ...metadata,
      },
      context: {
        service: 'redis',
        errorCode: error.code,
      },
      tags: ['redis', 'connection', 'failure'],
    });
  }

  async alertRedisMemoryPressure(memoryUsage: number, threshold: number, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: memoryUsage > threshold * 1.5 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
      category: AlertCategory.REDIS,
      title: 'Redis Memory Pressure',
      message: `Redis memory usage at ${memoryUsage}MB (threshold: ${threshold}MB)`,
      metadata: {
        memoryUsage,
        threshold,
        memoryPercentage: Math.round((memoryUsage / threshold) * 100),
        ...metadata,
      },
      context: {
        service: 'redis',
        errorCode: 'memory_pressure',
      },
      tags: ['redis', 'memory', 'performance'],
    });
  }

  async alertRedisSlowOperation(operation: string, duration: number, threshold: number, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: duration > threshold * 2 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      category: AlertCategory.REDIS,
      title: 'Redis Slow Operation',
      message: `Redis ${operation} took ${duration}ms (threshold: ${threshold}ms)`,
      metadata: {
        operation,
        duration,
        threshold,
        key: metadata.key,
        ...metadata,
      },
      context: {
        service: 'redis',
        errorCode: 'slow_operation',
      },
      tags: ['redis', 'performance', 'slow'],
    });
  }

  async alertSeatLockStampede(eventId: string, seatId: string, concurrentAttempts: number, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: concurrentAttempts > 50 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
      category: AlertCategory.BOOKING,
      title: 'Seat Lock Stampede Detected',
      message: `${concurrentAttempts} concurrent lock attempts for seat ${seatId} in event ${eventId}`,
      metadata: {
        eventId,
        seatId,
        concurrentAttempts,
        ...metadata,
      },
      context: {
        service: 'seat-locking',
        errorCode: 'lock_stampede',
      },
      tags: ['booking', 'redis', 'stampede', 'performance'],
    });
  }

  /**
   * Booking-specific alert helpers
   */
  async alertBookingStateInconsistency(bookingId: string, expectedState: string, actualState: string, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: AlertSeverity.CRITICAL,
      category: AlertCategory.BOOKING,
      title: 'Booking State Inconsistency',
      message: `Booking ${bookingId} state mismatch: expected ${expectedState}, found ${actualState}`,
      metadata: {
        bookingId,
        expectedState,
        actualState,
        ...metadata,
      },
      context: {
        service: 'booking-engine',
        errorCode: 'state_inconsistency',
      },
      tags: ['booking', 'fsm', 'critical', 'data-integrity'],
    });
  }

  async alertOrphanedPaymentIntent(paymentIntentId: string, bookingId: string, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: AlertSeverity.HIGH,
      category: AlertCategory.PAYMENT,
      title: 'Orphaned Payment Intent',
      message: `Payment intent ${paymentIntentId} exists without valid booking ${bookingId}`,
      metadata: {
        paymentIntentId,
        bookingId,
        ...metadata,
      },
      context: {
        service: 'payment-reconciliation',
        errorCode: 'orphaned_payment',
      },
      tags: ['payment', 'booking', 'orphaned', 'data-integrity'],
    });
  }

  /**
   * Performance alert helpers
   */
  async alertSlowApiResponse(endpoint: string, method: string, duration: number, threshold: number, metadata: any = {}): Promise<void> {
    await this.alert({
      severity: duration > threshold * 3 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      category: AlertCategory.PERFORMANCE,
      title: 'Slow API Response',
      message: `${method} ${endpoint} took ${duration}ms (threshold: ${threshold}ms)`,
      metadata: {
        endpoint,
        method,
        duration,
        threshold,
        ...metadata,
      },
      context: {
        service: 'api',
        endpoint,
        method,
        responseTime: duration,
      },
      tags: ['performance', 'api', 'slow'],
    });
  }

  /**
   * Helper methods
   */
  private enrichAlert(alertData: Partial<Alert>): Alert {
    const timestamp = new Date().toISOString();
    const id = this.generateAlertId();
    
    return {
      id,
      timestamp,
      severity: AlertSeverity.MEDIUM,
      category: AlertCategory.DATABASE,
      title: 'Unknown Alert',
      message: 'An unknown alert occurred',
      metadata: {},
      context: {
        service: 'unknown',
      },
      fingerprint: this.generateFingerprint(alertData),
      tags: [],
      resolved: false,
      ...alertData,
    } as Alert;
  }

  private isDuplicate(alert: Alert): boolean {
    const now = Date.now();
    const windowMs = this.config.dedupWindowMinutes * 60 * 1000;
    
    const lastSeen = this.dedupCache.get(alert.fingerprint);
    if (lastSeen && (now - lastSeen) < windowMs) {
      return true;
    }
    
    this.dedupCache.set(alert.fingerprint, now);
    
    // Cleanup old entries
    if (Math.random() < 0.1) { // 10% chance to cleanup
      this.cleanupDedupCache(windowMs);
    }
    
    return false;
  }

  private cleanupDedupCache(windowMs: number): void {
    const now = Date.now();
    for (const [fingerprint, timestamp] of this.dedupCache.entries()) {
      if ((now - timestamp) > windowMs) {
        this.dedupCache.delete(fingerprint);
      }
    }
  }

  private async storeAlert(alert: Alert): Promise<void> {
    try {
      // Store in Redis for real-time access
      await this.redis.lpush('alerts:realtime', JSON.stringify(alert));
      await this.redis.ltrim('alerts:realtime', 0, 999); // Keep last 1000 alerts

      // Store in PostgreSQL for persistence and analysis
      const client = await this.postgres.connect();
      try {
        await client.query(`
          INSERT INTO alerts (
            id, timestamp, severity, category, title, message, 
            metadata, context, correlation_id, fingerprint, tags, resolved
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO NOTHING
        `, [
          alert.id,
          alert.timestamp,
          alert.severity,
          alert.category,
          alert.title,
          alert.message,
          JSON.stringify(alert.metadata),
          JSON.stringify(alert.context),
          alert.correlationId,
          alert.fingerprint,
          alert.tags,
          alert.resolved,
        ]);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Failed to store alert:', error);
      // Fallback to console logging if storage fails
      console.error('ALERT:', JSON.stringify(alert, null, 2));
    }
  }

  private async routeAlert(alert: Alert): Promise<void> {
    // Route to appropriate notification channels based on severity
    switch (alert.severity) {
      case AlertSeverity.CRITICAL:
        await this.sendSlackAlert(alert);
        await this.sendEmailAlert(alert);
        await this.sendSMSAlert(alert);
        break;
      
      case AlertSeverity.HIGH:
        await this.sendSlackAlert(alert);
        await this.sendEmailAlert(alert);
        break;
      
      case AlertSeverity.MEDIUM:
        await this.sendSlackAlert(alert);
        break;
      
      case AlertSeverity.LOW:
        // Only log, no immediate notifications
        break;
    }

    // Publish to Redis stream for real-time subscribers
    await this.publishToStream(alert);
  }

  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.enableSlackNotifications || !this.config.slackWebhookUrl) {
      return;
    }

    try {
      const payload = {
        text: `🚨 ${alert.title}`,
        attachments: [
          {
            color: this.getSeverityColor(alert.severity),
            fields: [
              { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
              { title: 'Category', value: alert.category, short: true },
              { title: 'Service', value: alert.context.service, short: true },
              { title: 'Time', value: alert.timestamp, short: true },
              { title: 'Message', value: alert.message, short: false },
            ],
          },
        ],
      };

      // In a real implementation, you would use fetch to send to Slack
      console.log('Slack alert:', JSON.stringify(payload, null, 2));

    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.config.enableEmailNotifications || this.config.emailRecipients.length === 0) {
      return;
    }

    // In a real implementation, you would integrate with an email service
    console.log(`Email alert to ${this.config.emailRecipients.join(', ')}:`, alert.title);
  }

  private async sendSMSAlert(alert: Alert): Promise<void> {
    if (!this.config.enableSMSNotifications || this.config.smsRecipients.length === 0) {
      return;
    }

    // In a real implementation, you would integrate with an SMS service
    console.log(`SMS alert to ${this.config.smsRecipients.join(', ')}:`, alert.title);
  }

  private async publishToStream(alert: Alert): Promise<void> {
    try {
      await this.redis.xadd(
        'alerts:stream',
        '*',
        'alert', JSON.stringify(alert)
      );
    } catch (error) {
      console.error('Failed to publish alert to stream:', error);
    }
  }

  private async updateAlertMetrics(alert: Alert): Promise<void> {
    try {
      const metricsKey = `metrics:alerts:${alert.category}:${alert.severity}`;
      const hourKey = `${metricsKey}:${new Date().getHours()}`;
      
      await this.redis.incr(hourKey);
      await this.redis.expire(hourKey, 7200); // 2 hours
    } catch (error) {
      console.error('Failed to update alert metrics:', error);
    }
  }

  private async flushAlertBuffer(): Promise<void> {
    if (this.alertBuffer.length === 0) return;

    try {
      // Batch process buffered alerts
      const alerts = [...this.alertBuffer];
      this.alertBuffer = [];

      // Analyze patterns in buffered alerts
      await this.analyzeAlertPatterns(alerts);

    } catch (error) {
      console.error('Failed to flush alert buffer:', error);
    }
  }

  private async analyzeAlertPatterns(alerts: Alert[]): Promise<void> {
    // Group by category and severity
    const patterns = alerts.reduce((acc, alert) => {
      const key = `${alert.category}:${alert.severity}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Alert on patterns that might indicate systemic issues
    for (const [pattern, count] of Object.entries(patterns)) {
      if (count >= 5) { // 5+ alerts of same category/severity in batch
        await this.alert({
          severity: AlertSeverity.HIGH,
          category: AlertCategory.PERFORMANCE,
          title: 'Alert Pattern Detected',
          message: `Pattern detected: ${count} ${pattern} alerts in short timeframe`,
          metadata: { pattern, count, timeframe: '1 minute' },
          context: { service: 'alert-analysis' },
          tags: ['pattern', 'systemic'],
        });
      }
    }
  }

  /**
   * Utility methods
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(alertData: Partial<Alert>): string {
    // Create fingerprint for deduplication
    const key = `${alertData.category || 'unknown'}:${alertData.title || 'unknown'}:${alertData.context?.service || 'unknown'}:${alertData.metadata?.userId || 'global'}`;
    return require('crypto').createHash('md5').update(key).digest('hex');
  }

  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL: return 'danger';
      case AlertSeverity.HIGH: return 'warning';
      case AlertSeverity.MEDIUM: return 'good';
      case AlertSeverity.LOW: return '#439FE0';
      default: return 'good';
    }
  }

  /**
   * Public query methods for dashboards and monitoring
   */
  async getRecentAlerts(limit: number = 50, category?: AlertCategory): Promise<Alert[]> {
    try {
      const alerts = await this.redis.lrange('alerts:realtime', 0, limit - 1);
      const parsed = alerts.map(alert => JSON.parse(alert) as Alert);
      
      if (category) {
        return parsed.filter(alert => alert.category === category);
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to get recent alerts:', error);
      return [];
    }
  }

  async getAlertMetrics(hours: number = 24): Promise<Record<string, number>> {
    try {
      const metrics: Record<string, number> = {};
      const currentHour = new Date().getHours();
      
      for (let i = 0; i < hours; i++) {
        const hour = (currentHour - i + 24) % 24;
        const keys = await this.redis.keys(`metrics:alerts:*:${hour}`);
        
        for (const key of keys) {
          const count = await this.redis.get(key);
          if (count) {
            const category = key.split(':')[2];
            const severity = key.split(':')[3];
            const metricKey = `${category}_${severity}`;
            metrics[metricKey] = (metrics[metricKey] || 0) + parseInt(count);
          }
        }
      }
      
      return metrics;
    } catch (error) {
      console.error('Failed to get alert metrics:', error);
      return {};
    }
  }
}

// Pre-configured alert factory for common use cases
export class AlertFactory {
  static createStripePaymentFailureAlert(paymentIntentId: string, bookingId: string, error: any): Partial<Alert> {
    return {
      severity: AlertSeverity.HIGH,
      category: AlertCategory.PAYMENT,
      title: 'Stripe Payment Failure',
      message: `Payment failed for booking ${bookingId}`,
      metadata: { paymentIntentId, bookingId, stripeError: error.code },
      tags: ['stripe', 'payment', 'failure'],
    };
  }

  static createRedisConnectionAlert(error: any): Partial<Alert> {
    return {
      severity: AlertSeverity.HIGH,
      category: AlertCategory.REDIS,
      title: 'Redis Connection Lost',
      message: `Redis connection failed: ${error.message}`,
      metadata: { redisError: error.message, redisCode: error.code },
      tags: ['redis', 'connection', 'infrastructure'],
    };
  }

  static createBookingConflictAlert(bookingId: string, seatId: string, eventId: string): Partial<Alert> {
    return {
      severity: AlertSeverity.CRITICAL,
      category: AlertCategory.BOOKING,
      title: 'Booking Conflict Detected',
      message: `Multiple bookings attempted for seat ${seatId}`,
      metadata: { bookingId, seatId, eventId },
      tags: ['booking', 'conflict', 'data-integrity'],
    };
  }
}