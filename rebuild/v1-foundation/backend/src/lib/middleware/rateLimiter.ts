/**
 * LML v1 Foundation - Rate Limiting Middleware
 * ============================================
 * API rate limiting with Redis backing
 * Created: 2025-08-01
 * Status: Phase 1 Hardening
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '../db/redis';
import { getConfig, getRateLimitConfig } from '../config';

// ================================================
// RATE LIMIT CONFIGURATION
// ================================================

export interface RateLimitConfig {
  requests: number;         // Max requests per window
  windowMs: number;         // Time window in milliseconds
  keyGenerator?: (req: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  headers?: boolean;        // Include rate limit headers
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
  error?: string;
}

// ================================================
// RATE LIMITER CLASS
// ================================================

export class RateLimiter {
  private config: RateLimitConfig;
  private redis: any;

  constructor(config: Partial<RateLimitConfig> = {}) {
    const defaultConfig = getRateLimitConfig();
    
    this.config = {
      requests: config.requests || defaultConfig.requests,
      windowMs: config.windowMs || defaultConfig.windowMs,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      message: config.message || 'Too many requests, please try again later',
      headers: config.headers !== false, // Default to true
    };

    try {
      this.redis = getRedisClient();
    } catch (error) {
      console.warn('⚠️ Redis not available for rate limiting, using memory fallback');
      this.redis = null;
    }
  }

  /**
   * Check if request is within rate limit
   */
  async checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
    try {
      const key = this.config.keyGenerator!(request);
      
      if (!this.redis) {
        // Fallback to memory-based rate limiting (not persistent)
        return this.memoryRateLimit(key);
      }

      return await this.redisRateLimit(key);
    } catch (error) {
      console.error('❌ Rate limit check failed:', error);
      
      // On error, allow the request but log the issue
      return {
        allowed: true,
        remaining: this.config.requests,
        resetTime: Date.now() + this.config.windowMs,
        totalHits: 0,
        error: error instanceof Error ? error.message : 'Rate limit check failed',
      };
    }
  }

  /**
   * Redis-based rate limiting using sliding window
   */
  private async redisRateLimit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const window = this.config.windowMs;
    const limit = this.config.requests;
    
    // Create Redis key with window prefix
    const redisKey = `rate_limit:${key}:${Math.floor(now / window)}`;
    
    try {
      // Get current count and increment
      const pipeline = this.redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, Math.ceil(window / 1000));
      
      const results = await pipeline.exec();
      const totalHits = results[0][1] as number;
      
      const remaining = Math.max(0, limit - totalHits);
      const resetTime = Math.ceil(now / window) * window + window;
      
      return {
        allowed: totalHits <= limit,
        remaining,
        resetTime,
        totalHits,
      };
    } catch (error) {
      console.error('❌ Redis rate limit error:', error);
      throw error;
    }
  }

  /**
   * Memory-based rate limiting fallback
   */
  private memoryRateLimit(key: string): RateLimitResult {
    // Simple in-memory rate limiting (not recommended for production)
    const now = Date.now();
    const window = this.config.windowMs;
    const limit = this.config.requests;
    
    // This is a simplified implementation - in production, use Redis
    const windowKey = Math.floor(now / window);
    const memoryKey = `${key}:${windowKey}`;
    
    // Store in global memory (not ideal, but works for development)
    if (!global.rateLimitMemory) {
      global.rateLimitMemory = new Map();
    }
    
    const currentCount = global.rateLimitMemory.get(memoryKey) || 0;
    const newCount = currentCount + 1;
    global.rateLimitMemory.set(memoryKey, newCount);
    
    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      this.cleanupMemoryStore();
    }
    
    const remaining = Math.max(0, limit - newCount);
    const resetTime = (windowKey + 1) * window;
    
    return {
      allowed: newCount <= limit,
      remaining,
      resetTime,
      totalHits: newCount,
    };
  }

  /**
   * Clean up old memory entries
   */
  private cleanupMemoryStore(): void {
    if (!global.rateLimitMemory) return;
    
    const now = Date.now();
    const cutoff = now - this.config.windowMs * 2; // Keep last 2 windows
    
    for (const [key, _] of global.rateLimitMemory.entries()) {
      const parts = key.split(':');
      const timestamp = parseInt(parts[parts.length - 1]) * this.config.windowMs;
      
      if (timestamp < cutoff) {
        global.rateLimitMemory.delete(key);
      }
    }
  }

  /**
   * Default key generator (IP + User Agent)
   */
  private defaultKeyGenerator(request: NextRequest): string {
    const ip = this.getClientIP(request);
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const path = new URL(request.url).pathname;
    
    // Create a hash-like key from IP, User Agent, and path
    const key = `${ip}:${userAgent.substring(0, 50)}:${path}`;
    return key.replace(/[^a-zA-Z0-9:_-]/g, '_');
  }

  /**
   * Get client IP address
   */
  private getClientIP(request: NextRequest): string {
    // Check various headers for client IP
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
      return realIP;
    }
    
    const cfConnectingIP = request.headers.get('cf-connecting-ip');
    if (cfConnectingIP) {
      return cfConnectingIP;
    }
    
    return 'unknown';
  }

  /**
   * Create rate limit response headers
   */
  createHeaders(result: RateLimitResult): Record<string, string> {
    if (!this.config.headers) {
      return {};
    }

    return {
      'X-RateLimit-Limit': this.config.requests.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
      'X-RateLimit-Window': Math.ceil(this.config.windowMs / 1000).toString(),
    };
  }

  /**
   * Create rate limit exceeded response
   */
  createRateLimitResponse(result: RateLimitResult): NextResponse {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    
    const response = NextResponse.json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: this.config.message,
        details: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        timestamp: new Date().toISOString(),
      },
    }, { status: 429 });

    // Add rate limit headers
    const headers = this.createHeaders(result);
    headers['Retry-After'] = retryAfter.toString();
    
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }
}

// ================================================
// RATE LIMIT MIDDLEWARE FACTORY
// ================================================

/**
 * Create rate limiting middleware
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const rateLimiter = new RateLimiter(config);

  return async function rateLimitMiddleware(
    request: NextRequest,
    response?: NextResponse
  ): Promise<NextResponse | null> {
    try {
      const result = await rateLimiter.checkRateLimit(request);

      // Add rate limit headers to response
      if (response && rateLimiter.config.headers) {
        const headers = rateLimiter.createHeaders(result);
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }

      // Check if rate limit exceeded
      if (!result.allowed) {
        console.warn(`⚡ Rate limit exceeded for ${rateLimiter.defaultKeyGenerator(request)}`);
        return rateLimiter.createRateLimitResponse(result);
      }

      return null; // Allow request to continue
    } catch (error) {
      console.error('❌ Rate limiting middleware error:', error);
      return null; // Allow request on error
    }
  };
}

// ================================================
// PRESET RATE LIMITERS
// ================================================

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = createRateLimiter({
  requests: 5,           // 5 attempts
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many authentication attempts, please try again later',
});

/**
 * API rate limiter for general endpoints
 */
export const apiRateLimiter = createRateLimiter({
  requests: 100,         // 100 requests
  windowMs: 60 * 1000,   // 1 minute
  skipSuccessfulRequests: false,
});

/**
 * Generous rate limiter for public endpoints
 */
export const publicRateLimiter = createRateLimiter({
  requests: 1000,        // 1000 requests
  windowMs: 60 * 1000,   // 1 minute
  skipSuccessfulRequests: true,
});

/**
 * Strict rate limiter for expensive operations
 */
export const expensiveRateLimiter = createRateLimiter({
  requests: 10,          // 10 requests
  windowMs: 60 * 1000,   // 1 minute
  message: 'Rate limit exceeded for expensive operations',
});

// ================================================
// RATE LIMIT UTILITIES
// ================================================

/**
 * Check if rate limiting is enabled
 */
export function isRateLimitingEnabled(): boolean {
  const config = getConfig();
  return config.isProduction || config.isStaging;
}

/**
 * Get rate limit status for debugging
 */
export async function getRateLimitStatus(request: NextRequest): Promise<{
  enabled: boolean;
  redis: boolean;
  key: string;
  config: RateLimitConfig;
}> {
  const rateLimiter = new RateLimiter();
  
  return {
    enabled: isRateLimitingEnabled(),
    redis: !!rateLimiter.redis,
    key: rateLimiter.defaultKeyGenerator(request),
    config: rateLimiter.config,
  };
}

// Extend global type for memory store
declare global {
  var rateLimitMemory: Map<string, number> | undefined;
}