/**
 * LML v1 Foundation - Authentication Module Index
 * ===============================================
 * Central exports for authentication functionality
 * Created: 2025-08-01
 * Status: Phase 1 Hardening (Scaffolding)
 */

// ================================================
// TYPE IMPORTS & EXPORTS
// ================================================

import type {
  AuthUser,
  UserRole,
  UserSession,
  GuestSession,
  JWTPayload,
  APIKeyData,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  LogoutRequest,
  CreateGuestSessionRequest,
  Permission,
  AuthContext,
  AuthMiddlewareOptions,
  AuthMiddlewareResult,
  AuthError,
  AuthErrorCode,
} from './types';

import { AUTH_ERROR_CODES } from './types';

export type {
  AuthUser,
  UserRole,
  UserSession,
  GuestSession,
  JWTPayload,
  APIKeyData,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  LogoutRequest,
  CreateGuestSessionRequest,
  Permission,
  AuthContext,
  AuthMiddlewareOptions,
  AuthMiddlewareResult,
  AuthError,
  AuthErrorCode,
};

export { AUTH_ERROR_CODES };

// ================================================
// JWT UTILITIES
// ================================================

import {
  validateJWTConfig as validateJWTConfiguration,
} from './jwt-utils';

export {
  generateJWT,
  verifyJWT,
  extractTokenFromHeader,
  generateRefreshToken,
  verifyRefreshToken,
  validateJWTConfig as validateJWTConfiguration,
  hasPermission,
  isTokenExpiringSoon,
} from './jwt-utils';

// ================================================
// API KEY UTILITIES
// ================================================

export {
  generateAPIKey,
  verifyAPIKey,
  extractAPIKeyFromHeaders,
  revokeAPIKey,
  listAPIKeys,
  hasAPIKeyPermission,
  hashAPIKey,
  isValidAPIKeyFormat,
} from './api-key-utils';

// ================================================
// MIDDLEWARE
// ================================================

export {
  authMiddleware,
  requireAuth,
  optionalAuth,
  requireAdmin,
} from './middleware';

// ================================================
// AUTHENTICATION SERVICE (STUB)
// ================================================

/**
 * Authentication service for user management
 * TODO: Implement full authentication service in Phase 3
 */
export class AuthService {
  /**
   * Authenticate user with email/password (stub)
   */
  static async authenticate(email: string, password: string): Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
  }> {
    console.log('🔒 User Authentication (STUB):', { email });
    
    // TODO: Implement password verification with database lookup
    if (email === 'admin@lml.com' && password === 'admin123') {
      return {
        success: true,
        user: {
          id: 1,
          email,
          firstName: 'Admin',
          lastName: 'User',
          role: 'system_admin',
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
        },
      };
    }
    
    return {
      success: false,
      error: 'Invalid credentials',
    };
  }

  /**
   * Create guest session (stub)
   */
  static async createGuestSession(
    data: CreateGuestSessionRequest
  ): Promise<{
    success: boolean;
    session?: GuestSession;
    error?: string;
  }> {
    console.log('🔒 Guest Session Creation (STUB):', data);
    
    const sessionId = `guest_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    const session: GuestSession = {
      sessionId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdAt: new Date(),
      bookingContext: data.bookingContext ? {
        ...data.bookingContext,
        totalAmountPence: 0, // TODO: Calculate actual total from selected seats and show pricing
      } : undefined,
    };
    
    return {
      success: true,
      session,
    };
  }

  /**
   * Validate user session (stub)
   */
  static async validateSession(sessionId: string): Promise<{
    valid: boolean;
    session?: UserSession;
    error?: string;
  }> {
    console.log('🔒 Session Validation (STUB):', { sessionId });
    
    // TODO: Implement session lookup in database/Redis
    return {
      valid: true,
      session: {
        sessionId,
        userId: 1,
        userEmail: 'user@example.com',
        userRole: 'customer',
        isGuest: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      },
    };
  }

  /**
   * Logout user (stub)
   */
  static async logout(sessionId: string, logoutAll: boolean = false): Promise<{
    success: boolean;
    error?: string;
  }> {
    console.log('🔒 User Logout (STUB):', { sessionId, logoutAll });
    
    // TODO: Implement session invalidation in database/Redis
    return {
      success: true,
    };
  }
}

// ================================================
// CONFIGURATION VALIDATION
// ================================================

/**
 * Validate authentication configuration
 */
export function validateAuthConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check JWT configuration
  const jwtValidation = validateJWTConfiguration();
  if (!jwtValidation.valid) {
    errors.push(...jwtValidation.errors);
  }
  
  // Check environment-specific requirements
  const nodeEnv = process.env.NODE_ENV;
  
  if (nodeEnv === 'production') {
    if (!process.env.NEXTAUTH_SECRET) {
      errors.push('NEXTAUTH_SECRET is required in production');
    }
    
    if (!process.env.NEXTAUTH_URL) {
      warnings.push('NEXTAUTH_URL should be set in production');
    }
  }
  
  if (nodeEnv === 'development') {
    if (!process.env.NEXTAUTH_SECRET) {
      warnings.push('NEXTAUTH_SECRET should be set for development testing');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ================================================
// DEVELOPMENT HELPERS
// ================================================

/**
 * Log authentication status for development
 */
export function logAuthStatus(): void {
  const config = validateAuthConfig();
  
  console.log('\n🔒 Authentication Configuration:');
  
  if (config.valid) {
    console.log('   Status: ✅ Ready (Scaffolding)');
  } else {
    console.log('   Status: ❌ Configuration Issues');
    config.errors.forEach(error => {
      console.log(`   Error: ${error}`);
    });
  }
  
  if (config.warnings.length > 0) {
    console.log('   Warnings:');
    config.warnings.forEach(warning => {
      console.log(`   ⚠️ ${warning}`);
    });
  }
  
  console.log('   Implementation: Phase 3 (Scaffolding Only)');
  console.log('   JWT Support: Stub Implementation');
  console.log('   API Keys: Stub Implementation');
  console.log('   Sessions: Redis Integration Planned');
}