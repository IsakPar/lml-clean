/**
 * LML v1 Foundation - JWT Utilities
 * =================================
 * JWT token verification and management (scaffolding)
 * Created: 2025-08-01
 * Status: Phase 1 Hardening (Scaffolding)
 */

import { getConfig } from '../env';
import type { JWTPayload, AuthUser, UserRole } from './types';

// ================================================
// JWT CONFIGURATION
// ================================================

const JWT_CONFIG = {
  algorithm: 'HS256' as const,
  issuer: 'lml-v1-foundation',
  audience: 'lml-app',
  defaultExpiry: '24h',           // 24 hours
  refreshTokenExpiry: '30d',      // 30 days
  secretMinLength: 32,
};

// ================================================
// JWT UTILITIES (STUB IMPLEMENTATION)
// ================================================

/**
 * Generate JWT token (stub implementation)
 * TODO: Implement with jsonwebtoken library in Phase 3
 */
export async function generateJWT(
  user: AuthUser,
  sessionId: string,
  expiresIn: string = JWT_CONFIG.defaultExpiry
): Promise<{ token: string; expiresAt: Date }> {
  // Stub implementation for scaffolding
  console.log('🔒 JWT Generation (STUB):', { 
    userId: user.id, 
    email: user.email, 
    role: user.role,
    sessionId,
    expiresIn 
  });
  
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now
  
  // TODO: Replace with actual JWT generation
  const stubToken = `stub_jwt_${user.id}_${sessionId}_${Date.now()}`;
  
  return {
    token: stubToken,
    expiresAt,
  };
}

/**
 * Verify JWT token (stub implementation)
 * TODO: Implement with jsonwebtoken library in Phase 3
 */
export async function verifyJWT(token: string): Promise<{
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}> {
  // Stub implementation for scaffolding
  console.log('🔒 JWT Verification (STUB):', { token: token.substring(0, 20) + '...' });
  
  try {
    // TODO: Replace with actual JWT verification
    if (!token || token === '') {
      return {
        valid: false,
        error: 'Empty token',
      };
    }
    
    if (!token.startsWith('stub_jwt_')) {
      return {
        valid: false,
        error: 'Invalid token format',
      };
    }
    
    // Extract stub data from token
    const parts = token.split('_');
    if (parts.length < 5) {
      return {
        valid: false,
        error: 'Malformed token',
      };
    }
    
    const userId = parts[2];
    const sessionId = parts[3];
    const timestamp = parseInt(parts[4]);
    
    // Check if token is "expired" (24 hours)
    const now = Date.now();
    const tokenAge = now - timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (tokenAge > maxAge) {
      return {
        valid: false,
        error: 'Token expired',
      };
    }
    
    // Create stub payload
    const payload: JWTPayload = {
      sub: userId,
      email: `user${userId}@example.com`,
      role: 'customer',
      sessionId,
      iat: Math.floor(timestamp / 1000),
      exp: Math.floor((timestamp + maxAge) / 1000),
      aud: JWT_CONFIG.audience,
      iss: JWT_CONFIG.issuer,
    };
    
    return {
      valid: true,
      payload,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Token verification failed',
    };
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }
  
  // Support both "Bearer token" and "token" formats
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return authHeader;
}

/**
 * Generate refresh token (stub implementation)
 * TODO: Implement secure refresh token generation in Phase 3
 */
export async function generateRefreshToken(
  userId: number,
  sessionId: string
): Promise<{ refreshToken: string; expiresAt: Date }> {
  console.log('🔒 Refresh Token Generation (STUB):', { userId, sessionId });
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
  
  // TODO: Replace with secure refresh token generation
  const stubRefreshToken = `stub_refresh_${userId}_${sessionId}_${Date.now()}`;
  
  return {
    refreshToken: stubRefreshToken,
    expiresAt,
  };
}

/**
 * Verify refresh token (stub implementation)
 * TODO: Implement refresh token verification in Phase 3
 */
export async function verifyRefreshToken(refreshToken: string): Promise<{
  valid: boolean;
  userId?: number;
  sessionId?: string;
  error?: string;
}> {
  console.log('🔒 Refresh Token Verification (STUB):', { 
    token: refreshToken.substring(0, 20) + '...' 
  });
  
  try {
    // TODO: Replace with actual refresh token verification
    if (!refreshToken.startsWith('stub_refresh_')) {
      return {
        valid: false,
        error: 'Invalid refresh token format',
      };
    }
    
    const parts = refreshToken.split('_');
    if (parts.length < 5) {
      return {
        valid: false,
        error: 'Malformed refresh token',
      };
    }
    
    const userId = parseInt(parts[2]);
    const sessionId = parts[3];
    const timestamp = parseInt(parts[4]);
    
    // Check if refresh token is "expired" (30 days)
    const now = Date.now();
    const tokenAge = now - timestamp;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    if (tokenAge > maxAge) {
      return {
        valid: false,
        error: 'Refresh token expired',
      };
    }
    
    return {
      valid: true,
      userId,
      sessionId,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Refresh token verification failed',
    };
  }
}

// ================================================
// JWT VALIDATION HELPERS
// ================================================

/**
 * Validate JWT secret configuration
 */
export function validateJWTConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const config = getConfig();
  
  // Check if NEXTAUTH_SECRET exists and is long enough
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    errors.push('NEXTAUTH_SECRET environment variable is required for JWT tokens');
  } else if (secret.length < JWT_CONFIG.secretMinLength) {
    errors.push(`NEXTAUTH_SECRET must be at least ${JWT_CONFIG.secretMinLength} characters long`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if user role has sufficient permissions
 */
export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    guest: 0,
    customer: 1,
    venue_admin: 2,
    system_admin: 3,
  };
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if token is about to expire (within 1 hour)
 */
export function isTokenExpiringSoon(payload: JWTPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;
  const oneHour = 60 * 60; // 1 hour in seconds
  
  return timeUntilExpiry <= oneHour;
}