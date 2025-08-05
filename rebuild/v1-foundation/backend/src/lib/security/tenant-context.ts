/**
 * LML v1 Foundation - Tenant Context
 * ==================================
 * Tenant-aware context extraction for multi-tenant rate limiting
 * Created: 2025-08-05
 * Status: Phase 1B - Rate Limiting (Future-Proof Architecture)
 */

import { NextRequest } from 'next/server';

// ================================================
// TENANT CONTEXT TYPES
// ================================================

export interface TenantContext {
  tenantId: string;
  tenantType: 'org' | 'venue' | 'global';
  isGlobalRequest: boolean;
  extractionMethod: 'jwt' | 'subdomain' | 'path' | 'default';
}

export interface TenantRateLimits {
  tenantId: string;
  limits: {
    auth: { requests: number; windowMs: number; };
    booking: { requests: number; windowMs: number; };
    general: { requests: number; windowMs: number; };
  };
  customOverrides?: {
    premiumMultiplier?: number;
    burstAllowance?: number;
  };
}

// ================================================
// TENANT CONTEXT SERVICE
// ================================================

export class TenantContextService {
  /**
   * Extract tenant context from request
   * Phase 1B: Always returns 'global' - future-proof for multi-tenancy
   */
  async extractTenantContext(req: NextRequest): Promise<TenantContext> {
    // Phase 1B: Hardcoded to 'global' but with proper structure
    // Future Phase 3: Enable dynamic tenant extraction
    
    // TODO: Future tenant extraction methods
    // const jwtTenant = this.extractFromJWT(req);
    // const subdomainTenant = this.extractFromSubdomain(req);
    // const pathTenant = this.extractFromPath(req);
    
    return {
      tenantId: 'global',
      tenantType: 'global',
      isGlobalRequest: true,
      extractionMethod: 'default'
    };
  }

  /**
   * Build tenant-aware Redis key for rate limiting
   */
  buildTenantKey(
    context: TenantContext,
    tier: 'auth' | 'booking' | 'general',
    identifier: string
  ): string {
    // Tenant-aware key structure: rl:tenant:{tenantId}:{tier}:{identifier}
    return `rl:tenant:${context.tenantId}:${tier}:${identifier}`;
  }

  /**
   * Extract identifier for rate limiting (IP + User ID)
   */
  extractRateLimitIdentifier(req: NextRequest): string {
    const ip = this.extractIPAddress(req);
    const userId = this.extractUserID(req);
    
    // Combine IP and user ID for rate limiting key
    return userId ? `${ip}:user:${userId}` : `${ip}:anon`;
  }

  /**
   * Extract IP address from request
   */
  extractIPAddress(req: NextRequest): string {
    // Try various IP extraction methods
    const forwarded = req.headers.get('x-forwarded-for');
    const realIP = req.headers.get('x-real-ip');
    const remoteIP = req.headers.get('remote-addr');
    
    if (forwarded) {
      // Take first IP from forwarded header
      return forwarded.split(',')[0].trim();
    }
    
    return realIP || remoteIP || '127.0.0.1';
  }

  /**
   * Extract user ID from request (from JWT if authenticated)
   */
  private extractUserID(req: NextRequest): string | null {
    try {
      // Extract from Authorization header if present
      const authHeader = req.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return null;
      }

      // TODO: Integrate with existing JWT service for token parsing
      // For now, return null (anonymous user)
      // Future: const payload = await jwtService.verifyToken(token);
      // return payload.sub;
      
      return null;
    } catch {
      return null;
    }
  }

  // ================================================
  // FUTURE TENANT EXTRACTION METHODS (PHASE 3)
  // ================================================

  /**
   * Extract tenant from JWT payload (future)
   */
  private extractFromJWT(req: NextRequest): string | null {
    // TODO: Phase 3 implementation
    // const token = this.extractTokenFromHeader(req);
    // const payload = await jwtService.verifyToken(token);
    // return payload.orgId || payload.venueId;
    return null;
  }

  /**
   * Extract tenant from subdomain (future)
   * e.g., acme.lastminutelive.com -> 'acme'
   */
  private extractFromSubdomain(req: NextRequest): string | null {
    // TODO: Phase 3 implementation
    // const host = req.headers.get('host');
    // const subdomain = host?.split('.')[0];
    // return subdomain !== 'www' ? subdomain : null;
    return null;
  }

  /**
   * Extract tenant from URL path (future)
   * e.g., /org/acme/api/v1/... -> 'acme'
   */
  private extractFromPath(req: NextRequest): string | null {
    // TODO: Phase 3 implementation
    // const url = new URL(req.url);
    // const match = url.pathname.match(/\/org\/([^\/]+)\//);
    // return match?.[1] || null;
    return null;
  }
}

// ================================================
// SINGLETON INSTANCE
// ================================================

export const tenantContextService = new TenantContextService();

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Quick tenant context extraction
 */
export async function extractTenantContext(req: NextRequest): Promise<TenantContext> {
  return tenantContextService.extractTenantContext(req);
}

/**
 * Build tenant-aware rate limit key
 */
export function buildRateLimitKey(
  context: TenantContext,
  tier: 'auth' | 'booking' | 'general',
  identifier: string
): string {
  return tenantContextService.buildTenantKey(context, tier, identifier);
}