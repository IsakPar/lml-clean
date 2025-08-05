/**
 * LML v1 Foundation - Enhanced Rate Limiting Middleware
 * ====================================================
 * Tenant-aware rate limiting middleware for Next.js API routes
 * Created: 2025-08-05
 * Status: Phase 1B - Rate Limiting Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  rateLimiterService, 
  createRateLimitHeaders,
  type RateLimitResult 
} from '../security/rate-limiter';

// ================================================
// MIDDLEWARE FACTORY
// ================================================

/**
 * Create rate limiting middleware for specific endpoint tier
 */
export function createRateLimitMiddleware(tier: 'auth' | 'booking' | 'general') {
  return async function rateLimitMiddleware(req: NextRequest): Promise<NextResponse | null> {
    try {
      // Skip rate limiting if disabled or in development mode
      if (!rateLimiterService.isEnabled()) {
        return null; // Continue to next middleware
      }

      // Check rate limit
      const rateLimitResult = await rateLimiterService.checkRateLimit(req, tier);
      
      // Create response headers
      const headers = createRateLimitHeaders(rateLimitResult);
      
      if (!rateLimitResult.success) {
        // Rate limit exceeded - return 429 Too Many Requests
        return new NextResponse(
          JSON.stringify({
            error: 'Rate limit exceeded',
            message: getRateLimitMessage(tier, rateLimitResult),
            retryAfter: rateLimitResult.retryAfter,
            limit: rateLimitResult.limit,
            current: rateLimitResult.current,
            resetTime: rateLimitResult.resetTime.toISOString(),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              ...Object.fromEntries(headers.entries()),
            },
          }
        );
      }
      
      // Rate limit check passed, but add headers to response
      // Note: We'll add headers to the actual response in the wrapper
      return null; // Continue to next middleware
      
    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      
      // Fail open - allow request to continue if rate limiting fails
      return null;
    }
  };
}

/**
 * Get user-friendly rate limit message based on tier
 */
function getRateLimitMessage(
  tier: 'auth' | 'booking' | 'general',
  result: RateLimitResult
): string {
  switch (tier) {
    case 'auth':
      return `Too many authentication attempts. Please wait ${result.retryAfter} seconds before trying again. This protects against brute force attacks.`;
    
    case 'booking':
      return `Too many booking requests. Please wait ${result.retryAfter} seconds before making another booking request. This ensures fair access for all users.`;
    
    case 'general':
      return `Too many API requests. Please wait ${result.retryAfter} seconds before making another request. Rate limit: ${result.limit} requests per window.`;
    
    default:
      return `Rate limit exceeded. Please wait ${result.retryAfter} seconds before trying again.`;
  }
}

// ================================================
// ROUTE WRAPPER FUNCTIONS
// ================================================

/**
 * Wrap API route with rate limiting
 */
export function withRateLimit<T extends any[]>(
  tier: 'auth' | 'booking' | 'general',
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    // Apply rate limiting
    const rateLimitResponse = await createRateLimitMiddleware(tier)(req);
    
    if (rateLimitResponse) {
      // Rate limit exceeded
      return rateLimitResponse;
    }
    
    // Rate limit passed, execute original handler
    const response = await handler(req, ...args);
    
    // Add rate limit headers to successful response
    try {
      const rateLimitResult = await rateLimiterService.getRateLimitStatus(req, tier);
      if (rateLimitResult) {
        const headers = createRateLimitHeaders(rateLimitResult);
        headers.forEach((value, key) => {
          response.headers.set(key, value);
        });
      }
    } catch (error) {
      // Fail silently for header addition
      console.warn('Failed to add rate limit headers:', error);
    }
    
    return response;
  };
}

/**
 * Convenience wrapper for auth endpoints
 */
export function withAuthRateLimit<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return withRateLimit('auth', handler);
}

/**
 * Convenience wrapper for booking endpoints
 */
export function withBookingRateLimit<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return withRateLimit('booking', handler);
}

/**
 * Convenience wrapper for general API endpoints
 */
export function withGeneralRateLimit<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return withRateLimit('general', handler);
}

// ================================================
// RATE LIMIT STATUS ENDPOINT HELPER
// ================================================

/**
 * Get current rate limit status for debugging/monitoring
 */
export async function getRateLimitStatusResponse(
  req: NextRequest,
  tier: 'auth' | 'booking' | 'general'
): Promise<NextResponse> {
  try {
    const status = await rateLimiterService.getRateLimitStatus(req, tier);
    
    if (!status) {
      return NextResponse.json({
        error: 'Rate limiting not available',
        enabled: false,
      }, { status: 503 });
    }
    
    const headers = createRateLimitHeaders(status);
    
    return NextResponse.json({
      tier,
      status: status.success ? 'ok' : 'limited',
      limit: status.limit,
      current: status.current,
      remaining: status.remaining,
      resetTime: status.resetTime.toISOString(),
      retryAfter: status.retryAfter,
    }, { 
      headers: Object.fromEntries(headers.entries()) 
    });
    
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    
    return NextResponse.json({
      error: 'Failed to get rate limit status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ================================================
// ADMIN FUNCTIONS
// ================================================

/**
 * Reset rate limit for specific identifier (admin function)
 */
export async function resetRateLimitResponse(
  tenantId: string,
  tier: 'auth' | 'booking' | 'general',
  identifier: string
): Promise<NextResponse> {
  try {
    const success = await rateLimiterService.resetRateLimit(tenantId, tier, identifier);
    
    if (success) {
      return NextResponse.json({
        message: 'Rate limit reset successfully',
        tenantId,
        tier,
        identifier,
      });
    } else {
      return NextResponse.json({
        error: 'Failed to reset rate limit',
        tenantId,
        tier,
        identifier,
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    
    return NextResponse.json({
      error: 'Failed to reset rate limit',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ================================================
// MIDDLEWARE COMPOSITION HELPER
// ================================================

/**
 * Compose multiple middleware functions
 */
export function composeMiddleware(
  ...middlewares: Array<(req: NextRequest) => Promise<NextResponse | null>>
) {
  return async (req: NextRequest): Promise<NextResponse | null> => {
    for (const middleware of middlewares) {
      const result = await middleware(req);
      if (result) {
        // Middleware returned a response, stop processing
        return result;
      }
    }
    
    // All middleware passed, continue to handler
    return null;
  };
}

/**
 * Create combined auth + general rate limiting
 */
export function createCombinedRateLimit(primaryTier: 'auth' | 'booking' | 'general') {
  return composeMiddleware(
    createRateLimitMiddleware(primaryTier),
    createRateLimitMiddleware('general')
  );
}