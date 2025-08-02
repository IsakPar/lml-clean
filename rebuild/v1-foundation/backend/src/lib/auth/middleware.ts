/**
 * LML v1 Foundation - Authentication Middleware
 * =============================================
 * Authentication middleware for API routes (scaffolding)
 * Created: 2025-08-01
 * Status: Phase 1 Hardening (Scaffolding)
 */

import { NextRequest } from 'next/server';
import { verifyJWT, extractTokenFromHeader } from './jwt-utils';
import { getConfig } from '../env';
import type { 
  AuthContext, 
  AuthMiddlewareOptions, 
  AuthMiddlewareResult,
  AuthUser,
  UserSession,
  GuestSession,
  Permission
} from './types';

// ================================================
// AUTHENTICATION MIDDLEWARE (STUB)
// ================================================

/**
 * Authentication middleware for API routes
 * TODO: Implement full authentication in Phase 3
 */
export async function authMiddleware(
  request: NextRequest,
  options: AuthMiddlewareOptions = {
    required: false,
    allowGuests: true,
  }
): Promise<AuthMiddlewareResult> {
  console.log('🔒 Auth Middleware (STUB):', {
    url: request.url,
    method: request.method,
    options,
  });
  
  try {
    // Extract token from request
    const authHeader = request.headers.get('Authorization');
    const token = extractTokenFromHeader(authHeader);
    
    // If no token and auth is required
    if (!token && options.required) {
      return {
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authentication token is required',
          statusCode: 401,
        },
      };
    }
    
    // If no token but guests are allowed
    if (!token && options.allowGuests) {
      const guestContext = await createGuestContext(request);
      return {
        success: true,
        context: guestContext,
      };
    }
    
    // If no token and no guests allowed
    if (!token) {
      return {
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authentication is required',
          statusCode: 401,
        },
      };
    }
    
    // Verify token
    const tokenResult = await verifyJWT(token);
    
    if (!tokenResult.valid) {
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: tokenResult.error || 'Invalid authentication token',
          statusCode: 401,
        },
      };
    }
    
    // Create authenticated context
    const authContext = await createAuthenticatedContext(request, tokenResult.payload!);
    
    // Check role requirements
    if (options.roles && !options.roles.includes(authContext.user!.role)) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions for this operation',
          statusCode: 403,
        },
      };
    }
    
    // Check permission requirements
    if (options.permissions && !hasRequiredPermissions(authContext, options.permissions)) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions for this operation',
          statusCode: 403,
        },
      };
    }
    
    return {
      success: true,
      context: authContext,
    };
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    
    return {
      success: false,
      error: {
        code: 'AUTH_SERVICE_ERROR',
        message: 'Authentication service error',
        statusCode: 500,
      },
    };
  }
}

// ================================================
// CONTEXT CREATION HELPERS
// ================================================

/**
 * Create guest session context
 */
async function createGuestContext(request: NextRequest): Promise<AuthContext> {
  const sessionId = generateGuestSessionId();
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get('User-Agent') || undefined;
  
  const guestSession: GuestSession = {
    sessionId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    createdAt: new Date(),
  };
  
  return {
    guestSession,
    permissions: getGuestPermissions(),
    isAuthenticated: false,
    isGuest: true,
    ipAddress,
    userAgent,
  };
}

/**
 * Create authenticated user context
 */
async function createAuthenticatedContext(
  request: NextRequest,
  jwtPayload: any
): Promise<AuthContext> {
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get('User-Agent') || undefined;
  
  // TODO: Fetch real user data from database in Phase 3
  const user: AuthUser = {
    id: parseInt(jwtPayload.sub),
    email: jwtPayload.email,
    role: jwtPayload.role,
    isActive: true,
    emailVerified: true,
    createdAt: new Date(),
  };
  
  const session: UserSession = {
    sessionId: jwtPayload.sessionId,
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    isGuest: false,
    expiresAt: new Date(jwtPayload.exp * 1000),
    createdAt: new Date(jwtPayload.iat * 1000),
    lastActiveAt: new Date(),
    ipAddress,
    userAgent,
  };
  
  return {
    user,
    session,
    permissions: getUserPermissions(user.role),
    isAuthenticated: true,
    isGuest: false,
    ipAddress,
    userAgent,
  };
}

// ================================================
// PERMISSION HELPERS
// ================================================

/**
 * Get permissions for guest users
 */
function getGuestPermissions(): Permission[] {
  return [
    { action: 'read', resource: 'shows' },
    { action: 'read', resource: 'venues' },
    { action: 'write', resource: 'bookings', scope: 'own' },
  ];
}

/**
 * Get permissions based on user role
 */
function getUserPermissions(role: string): Permission[] {
  const basePermissions = getGuestPermissions();
  
  switch (role) {
    case 'customer':
      return [
        ...basePermissions,
        { action: 'read', resource: 'bookings', scope: 'own' },
        { action: 'write', resource: 'users', scope: 'own' },
      ];
    
    case 'venue_admin':
      return [
        ...basePermissions,
        { action: 'read', resource: 'bookings', scope: 'venue' },
        { action: 'write', resource: 'venues', scope: 'venue' },
        { action: 'read', resource: 'users', scope: 'venue' },
      ];
    
    case 'system_admin':
      return [
        { action: 'read', resource: '*' },
        { action: 'write', resource: '*' },
        { action: 'delete', resource: '*' },
        { action: 'admin', resource: '*' },
      ];
    
    default:
      return basePermissions;
  }
}

/**
 * Check if context has required permissions
 */
function hasRequiredPermissions(context: AuthContext, requiredPermissions: Permission[]): boolean {
  return requiredPermissions.every(required => {
    return context.permissions.some(userPerm => {
      // Check if user has admin permission for everything
      if (userPerm.action === 'admin' && userPerm.resource === '*') {
        return true;
      }
      
      // Check specific permission match
      const actionMatch = userPerm.action === required.action || userPerm.action === '*';
      const resourceMatch = userPerm.resource === required.resource || userPerm.resource === '*';
      const scopeMatch = !required.scope || userPerm.scope === required.scope || userPerm.scope === 'all';
      
      return actionMatch && resourceMatch && scopeMatch;
    });
  });
}

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Generate guest session ID
 */
function generateGuestSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2);
  return `guest_${timestamp}_${randomPart}`;
}

/**
 * Get client IP address from request
 */
function getClientIP(request: NextRequest): string | undefined {
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
  
  return undefined;
}

/**
 * Create auth middleware with preset options
 */
export function requireAuth(options: Partial<AuthMiddlewareOptions> = {}) {
  return (request: NextRequest) => authMiddleware(request, {
    required: true,
    allowGuests: false,
    ...options,
  });
}

/**
 * Create auth middleware that allows guests
 */
export function optionalAuth(options: Partial<AuthMiddlewareOptions> = {}) {
  return (request: NextRequest) => authMiddleware(request, {
    required: false,
    allowGuests: true,
    ...options,
  });
}

/**
 * Create auth middleware for admin only
 */
export function requireAdmin() {
  return (request: NextRequest) => authMiddleware(request, {
    required: true,
    allowGuests: false,
    roles: ['system_admin'],
  });
}