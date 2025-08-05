/**
 * LML v1 Foundation - Enhanced Rate Limiting Test
 * ===============================================
 * Test endpoint demonstrating tenant-aware rate limiting
 * Created: 2025-08-05
 * Status: Phase 1B Testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  withAuthRateLimit,
  withBookingRateLimit,
  withGeneralRateLimit,
  getRateLimitStatusResponse,
  resetRateLimitResponse 
} from '@/lib/middleware/rate-limit-enhanced';
import { tenantContextService } from '@/lib/security/tenant-context';

// ================================================
// TEST ENDPOINTS WITH DIFFERENT RATE LIMIT TIERS
// ================================================

/**
 * Test auth tier rate limiting (5 requests/15min)
 */
export const POST = withAuthRateLimit(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const { action = 'test' } = body;

  switch (action) {
    case 'auth':
      return NextResponse.json({
        message: 'Auth endpoint accessed successfully',
        tier: 'auth',
        limits: '5 requests per 15 minutes',
        timestamp: new Date().toISOString(),
      });

    case 'status':
      const tier = body.tier || 'general';
      return await getRateLimitStatusResponse(req, tier);

    case 'reset':
      if (!body.tenantId || !body.tier || !body.identifier) {
        return NextResponse.json({
          error: 'Missing required fields: tenantId, tier, identifier'
        }, { status: 400 });
      }
      return await resetRateLimitResponse(body.tenantId, body.tier, body.identifier);

    default:
      return NextResponse.json({
        error: 'Invalid action',
        validActions: ['auth', 'status', 'reset'],
      }, { status: 400 });
  }
});

/**
 * Test booking tier rate limiting (100 requests/1min)
 */
export const PUT = withBookingRateLimit(async (req: NextRequest) => {
  return NextResponse.json({
    message: 'Booking endpoint accessed successfully',
    tier: 'booking',
    limits: '100 requests per 1 minute',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Test general tier rate limiting (1000 requests/15min)
 */
export const GET = withGeneralRateLimit(async (req: NextRequest) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'test';
  const tier = url.searchParams.get('tier') || 'general';

  switch (action) {
    case 'test':
      return NextResponse.json({
        message: 'General endpoint accessed successfully',
        tier: 'general',
        limits: '1000 requests per 15 minutes',
        timestamp: new Date().toISOString(),
      });

    case 'status':
      return await getRateLimitStatusResponse(req, tier as any);

    case 'context':
      // Show tenant context extraction
      const context = await tenantContextService.extractTenantContext(req);
      const identifier = tenantContextService.extractRateLimitIdentifier(req);
      
      return NextResponse.json({
        message: 'Tenant context extracted',
        context,
        identifier,
        rateLimitKey: tenantContextService.buildTenantKey(context, 'general', identifier),
        timestamp: new Date().toISOString(),
      });

    case 'load-test':
      // Simple load test endpoint
      const count = parseInt(url.searchParams.get('count') || '10');
      const delay = parseInt(url.searchParams.get('delay') || '0');
      
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return NextResponse.json({
        message: `Load test completed`,
        requestCount: count,
        delay,
        timestamp: new Date().toISOString(),
      });

    default:
      return NextResponse.json({
        error: 'Invalid action',
        validActions: ['test', 'status', 'context', 'load-test'],
      }, { status: 400 });
  }
});

/**
 * Unprotected endpoint for comparison
 */
export const PATCH = async (req: NextRequest) => {
  return NextResponse.json({
    message: 'Unprotected endpoint - no rate limiting',
    warning: 'This endpoint has no rate limiting applied',
    timestamp: new Date().toISOString(),
  });
};