/**
 * LML v1 Foundation - Security Monitor
 * ====================================
 * Basic security violation tracking and alerting
 * Created: 2025-08-05
 * Status: Phase 1 Auth Infrastructure
 */

import { getConfig } from '../env';

// ================================================
// SECURITY VIOLATION TYPES
// ================================================

export type SecurityViolationType = 
  | 'INVALID_TOKEN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'BRUTE_FORCE_ATTEMPT'
  | 'SUSPICIOUS_REQUEST'
  | 'UNAUTHORIZED_ACCESS'
  | 'AUTH_BYPASS_ATTEMPT';

export interface SecurityViolation {
  type: SecurityViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  endpoint: string;
  timestamp: Date;
  details: Record<string, any>;
}

// ================================================
// SECURITY MONITOR CLASS
// ================================================

export class SecurityMonitor {
  private webhookUrl?: string;

  constructor() {
    const config = getConfig();
    this.webhookUrl = config.auth.securityWebhookUrl;
  }

  /**
   * Log a security violation
   */
  async logViolation(violation: Omit<SecurityViolation, 'timestamp'>): Promise<void> {
    const fullViolation: SecurityViolation = {
      ...violation,
      timestamp: new Date(),
    };

    // Log to console for development
    console.warn('🚨 Security Violation:', {
      type: fullViolation.type,
      severity: fullViolation.severity,
      endpoint: fullViolation.endpoint,
      ip: fullViolation.ipAddress,
      timestamp: fullViolation.timestamp.toISOString(),
    });

    // Send to webhook if configured
    if (this.webhookUrl) {
      try {
        await this.sendWebhookAlert(fullViolation);
      } catch (error) {
        console.error('Failed to send security webhook:', error);
      }
    }

    // Store in audit log if critical
    if (fullViolation.severity === 'critical') {
      // TODO: Integrate with audit logging system
      console.error('🔥 CRITICAL SECURITY VIOLATION:', fullViolation);
    }
  }

  /**
   * Log invalid token attempt
   */
  async logInvalidToken(request: {
    ipAddress: string;
    userAgent: string;
    endpoint: string;
    token?: string;
  }): Promise<void> {
    await this.logViolation({
      type: 'INVALID_TOKEN',
      severity: 'medium',
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      endpoint: request.endpoint,
      details: {
        tokenPresent: !!request.token,
        tokenLength: request.token?.length || 0,
      },
    });
  }

  /**
   * Log rate limit exceeded
   */
  async logRateLimitExceeded(request: {
    ipAddress: string;
    userAgent: string;
    endpoint: string;
    currentCount: number;
    limit: number;
  }): Promise<void> {
    await this.logViolation({
      type: 'RATE_LIMIT_EXCEEDED',
      severity: 'medium',
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      endpoint: request.endpoint,
      details: {
        currentCount: request.currentCount,
        limit: request.limit,
        overagePercent: Math.round(((request.currentCount - request.limit) / request.limit) * 100),
      },
    });
  }

  /**
   * Log brute force attempt
   */
  async logBruteForceAttempt(request: {
    ipAddress: string;
    userAgent: string;
    endpoint: string;
    email?: string;
    attemptCount: number;
  }): Promise<void> {
    await this.logViolation({
      type: 'BRUTE_FORCE_ATTEMPT',
      severity: request.attemptCount > 10 ? 'critical' : 'high',
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      endpoint: request.endpoint,
      details: {
        email: request.email,
        attemptCount: request.attemptCount,
      },
    });
  }

  /**
   * Send webhook alert for security violations
   */
  private async sendWebhookAlert(violation: SecurityViolation): Promise<void> {
    if (!this.webhookUrl) return;

    const payload = {
      alert_type: 'security_violation',
      severity: violation.severity,
      violation_type: violation.type,
      timestamp: violation.timestamp.toISOString(),
      source: {
        ip_address: violation.ipAddress,
        user_agent: violation.userAgent,
        endpoint: violation.endpoint,
      },
      details: violation.details,
    };

    // Simple webhook call (in production, add retry logic, authentication, etc.)
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LML-Security-Monitor/1.0',
      },
      body: JSON.stringify(payload),
    });
  }
}

// ================================================
// SINGLETON INSTANCE
// ================================================

export const securityMonitor = new SecurityMonitor();

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Quick security violation logging
 */
export async function logSecurityViolation(
  type: SecurityViolationType,
  request: {
    ipAddress: string;
    userAgent: string;
    endpoint: string;
    severity?: SecurityViolation['severity'];
    details?: Record<string, any>;
  }
): Promise<void> {
  await securityMonitor.logViolation({
    type,
    severity: request.severity || 'medium',
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    endpoint: request.endpoint,
    details: request.details || {},
  });
}

/**
 * Extract request info for security logging
 */
export function extractRequestInfo(req: any): {
  ipAddress: string;
  userAgent: string;
  endpoint: string;
} {
  return {
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    endpoint: `${req.method} ${req.url || req.path || 'unknown'}`,
  };
}