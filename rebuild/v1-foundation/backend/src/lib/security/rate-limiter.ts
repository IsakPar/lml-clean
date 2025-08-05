/**
 * LML v1 Foundation - Rate Limiter Service
 * ========================================
 * Tenant-aware rate limiting with Redis backend
 * Created: 2025-08-05
 * Status: Phase 1B - Rate Limiting Implementation
 */

import { NextRequest } from 'next/server';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { getConfig } from '../env';
import { 
  tenantContextService, 
  type TenantContext, 
  type TenantRateLimits 
} from './tenant-context';
import { securityMonitor } from './monitor';

// ================================================
// RATE LIMIT RESULT TYPES
// ================================================

export interface RateLimitResult {
  success: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number; // seconds until next allowed request
}

export interface RateLimitViolation {
  tenantId: string;
  tier: string;
  identifier: string;
  current: number;
  limit: number;
  retryAfter: number;
}

// ================================================
// TENANT-AWARE RATE LIMITER SERVICE
// ================================================

export class TenantAwareRateLimiterService {
  private redisClient: ReturnType<typeof createClient> | null = null;
  private rateLimiters: Map<string, RateLimiterRedis> = new Map();
  private config: ReturnType<typeof getConfig>;

  constructor() {
    this.config = getConfig();
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection for rate limiting
   */
  private async initializeRedis(): Promise<void> {
    try {
      // Use existing Redis configuration
      this.redisClient = createClient({
        url: this.config.database.redisUrl,
      });

      await this.redisClient.connect();
      console.log('✅ Rate Limiter Redis connected');
    } catch (error) {
      console.error('❌ Rate Limiter Redis connection failed:', error);
      // Graceful degradation - continue without Redis
    }
  }

  /**
   * Check rate limit for a request
   */
  async checkRateLimit(
    req: NextRequest,
    tier: 'auth' | 'booking' | 'general'
  ): Promise<RateLimitResult> {
    try {
      // Extract tenant context
      const tenantContext = await tenantContextService.extractTenantContext(req);
      
      // Get rate limiter for this tenant and tier
      const rateLimiter = await this.getRateLimiter(tenantContext, tier);
      
      // Extract identifier for rate limiting
      const identifier = tenantContextService.extractRateLimitIdentifier(req);
      
      // Build tenant-aware key
      const key = tenantContextService.buildTenantKey(tenantContext, tier, identifier);
      
      // Apply rate limiting
      const result = await rateLimiter.consume(key);
      
      return {
        success: true,
        limit: rateLimiter.points,
        current: rateLimiter.points - result.remainingPoints,
        remaining: result.remainingPoints,
        resetTime: new Date(Date.now() + result.msBeforeNext),
      };
      
    } catch (rateLimiterRes: any) {
      // Rate limit exceeded
      await this.handleRateLimitViolation(req, tier, rateLimiterRes);
      
      return {
        success: false,
        limit: rateLimiterRes.totalHits || 0,
        current: rateLimiterRes.totalHits || 0,
        remaining: 0,
        resetTime: new Date(Date.now() + (rateLimiterRes.msBeforeNext || 0)),
        retryAfter: Math.round((rateLimiterRes.msBeforeNext || 0) / 1000),
      };
    }
  }

  /**
   * Get or create rate limiter for tenant and tier
   */
  private async getRateLimiter(
    context: TenantContext,
    tier: 'auth' | 'booking' | 'general'
  ): Promise<RateLimiterRedis> {
    const key = `${context.tenantId}:${tier}`;
    
    if (this.rateLimiters.has(key)) {
      return this.rateLimiters.get(key)!;
    }
    
    // Get tenant-specific limits
    const limits = await this.getTenantLimits(context.tenantId);
    const tierLimits = this.getTierLimits(tier, limits);
    
    // Create rate limiter with tenant-specific configuration
    const rateLimiter = new RateLimiterRedis({
      storeClient: this.redisClient,
      keyPrefix: `rl:tenant:${context.tenantId}:${tier}:`,
      points: tierLimits.requests,
      duration: Math.floor(tierLimits.windowMs / 1000), // Convert to seconds
      blockDuration: Math.floor(tierLimits.windowMs / 1000), // Block for same duration
      execEvenly: true, // Distribute requests evenly across window
    });
    
    this.rateLimiters.set(key, rateLimiter);
    return rateLimiter;
  }

  /**
   * Get tenant-specific rate limits (stub for future)
   */
  private async getTenantLimits(tenantId: string): Promise<TenantRateLimits> {
    // Phase 1B: Return global config from environment
    // Future Phase 3: Query database for tenant-specific limits
    
    return {
      tenantId,
      limits: {
        auth: {
          requests: this.config.rateLimit.auth.requests,
          windowMs: this.config.rateLimit.auth.windowMs,
        },
        booking: {
          requests: this.config.rateLimit.booking.requests,
          windowMs: this.config.rateLimit.booking.windowMs,
        },
        general: {
          requests: this.config.rateLimit.requests,
          windowMs: this.config.rateLimit.windowMs,
        },
      },
    };
  }

  /**
   * Get tier-specific limits from tenant configuration
   */
  private getTierLimits(
    tier: 'auth' | 'booking' | 'general',
    tenantLimits: TenantRateLimits
  ): { requests: number; windowMs: number } {
    switch (tier) {
      case 'auth':
        return tenantLimits.limits.auth;
      case 'booking':
        return tenantLimits.limits.booking;
      case 'general':
        return tenantLimits.limits.general;
      default:
        return tenantLimits.limits.general;
    }
  }

  /**
   * Handle rate limit violation
   */
  private async handleRateLimitViolation(
    req: NextRequest,
    tier: string,
    rateLimiterRes: any
  ): Promise<void> {
    try {
      const tenantContext = await tenantContextService.extractTenantContext(req);
      const identifier = tenantContextService.extractRateLimitIdentifier(req);
      
      // Log security violation
      await securityMonitor.logRateLimitExceeded({
        ipAddress: tenantContextService.extractIPAddress(req),
        userAgent: req.headers.get('user-agent') || 'unknown',
        endpoint: req.url,
        currentCount: rateLimiterRes.totalHits,
        limit: rateLimiterRes.points || 0,
      });
      
      // Additional violation logging
      console.warn(`🚨 Rate limit exceeded: ${tenantContext.tenantId}:${tier}:${identifier}`, {
        current: rateLimiterRes.totalHits,
        limit: rateLimiterRes.points,
        retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000),
      });
      
    } catch (error) {
      console.error('Error handling rate limit violation:', error);
    }
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.redisClient !== null;
  }

  /**
   * Get rate limit status for a request (without consuming)
   */
  async getRateLimitStatus(
    req: NextRequest,
    tier: 'auth' | 'booking' | 'general'
  ): Promise<RateLimitResult | null> {
    try {
      const tenantContext = await tenantContextService.extractTenantContext(req);
      const identifier = tenantContextService.extractRateLimitIdentifier(req);
      const key = tenantContextService.buildTenantKey(tenantContext, tier, identifier);
      
      const rateLimiter = await this.getRateLimiter(tenantContext, tier);
      const result = await rateLimiter.get(key);
      
      if (!result) {
        return {
          success: true,
          limit: rateLimiter.points,
          current: 0,
          remaining: rateLimiter.points,
          resetTime: new Date(),
        };
      }
      
      return {
        success: result.remainingPoints > 0,
        limit: rateLimiter.points,
        current: rateLimiter.points - result.remainingPoints,
        remaining: result.remainingPoints,
        resetTime: new Date(Date.now() + result.msBeforeNext),
        retryAfter: result.remainingPoints <= 0 ? Math.round(result.msBeforeNext / 1000) : undefined,
      };
      
    } catch (error) {
      console.error('Error getting rate limit status:', error);
      return null;
    }
  }

  /**
   * Reset rate limit for a specific key (admin function)
   */
  async resetRateLimit(
    tenantId: string,
    tier: 'auth' | 'booking' | 'general',
    identifier: string
  ): Promise<boolean> {
    try {
      const context: TenantContext = {
        tenantId,
        tenantType: 'global',
        isGlobalRequest: true,
        extractionMethod: 'default',
      };
      
      const rateLimiter = await this.getRateLimiter(context, tier);
      const key = tenantContextService.buildTenantKey(context, tier, identifier);
      
      await rateLimiter.delete(key);
      return true;
      
    } catch (error) {
      console.error('Error resetting rate limit:', error);
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        console.log('✅ Rate Limiter Redis disconnected gracefully');
      } catch (error) {
        console.error('Error disconnecting rate limiter Redis:', error);
      }
    }
  }
}

// ================================================
// SINGLETON INSTANCE
// ================================================

export const rateLimiterService = new TenantAwareRateLimiterService();

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Quick rate limit check
 */
export async function checkRateLimit(
  req: NextRequest,
  tier: 'auth' | 'booking' | 'general'
): Promise<RateLimitResult> {
  return rateLimiterService.checkRateLimit(req, tier);
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  
  headers.set('X-RateLimit-Limit', result.limit.toString());
  headers.set('X-RateLimit-Remaining', result.remaining.toString());
  headers.set('X-RateLimit-Reset', result.resetTime.toISOString());
  
  if (result.retryAfter) {
    headers.set('Retry-After', result.retryAfter.toString());
  }
  
  return headers;
}