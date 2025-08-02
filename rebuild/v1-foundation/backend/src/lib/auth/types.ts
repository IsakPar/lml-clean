/**
 * LML v1 Foundation - Authentication Types
 * ========================================
 * Type definitions for future authentication implementation
 * Created: 2025-08-01
 * Status: Phase 1 Hardening (Scaffolding)
 */

// ================================================
// USER & SESSION TYPES
// ================================================

export interface AuthUser {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

export type UserRole = 'guest' | 'customer' | 'venue_admin' | 'system_admin';

export interface UserSession {
  sessionId: string;
  userId: number;
  userEmail: string;
  userRole: UserRole;
  isGuest: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastActiveAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

// ================================================
// TOKEN TYPES
// ================================================

export interface JWTPayload {
  sub: string;           // User ID
  email: string;         // User email
  role: UserRole;        // User role
  sessionId: string;     // Session ID
  iat: number;          // Issued at
  exp: number;          // Expires at
  aud: string;          // Audience (app name)
  iss: string;          // Issuer (domain)
}

export interface APIKeyData {
  keyId: string;
  userId: number;
  keyName: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}

// ================================================
// AUTHENTICATION REQUEST/RESPONSE TYPES
// ================================================

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  success: boolean;
  user: AuthUser;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  token?: string;
  sessionId?: string;
  logoutAll?: boolean;
}

// ================================================
// GUEST SESSION TYPES
// ================================================

export interface GuestSession {
  sessionId: string;
  email?: string;        // For booking without account
  firstName?: string;
  lastName?: string;
  phone?: string;
  expiresAt: Date;
  createdAt: Date;
  bookingContext?: {
    showId: number;
    selectedSeats: string[];
    totalAmountPence: number;
  };
}

export interface CreateGuestSessionRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  bookingContext?: {
    showId: number;
    selectedSeats: string[];
  };
}

// ================================================
// AUTHORIZATION TYPES
// ================================================

export interface Permission {
  action: string;        // 'read', 'write', 'delete', 'admin'
  resource: string;      // 'shows', 'bookings', 'users', 'venues'
  scope?: string;        // 'own', 'venue', 'all'
}

export interface AuthContext {
  user?: AuthUser;
  session?: UserSession;
  guestSession?: GuestSession;
  permissions: Permission[];
  isAuthenticated: boolean;
  isGuest: boolean;
  ipAddress?: string;
  userAgent?: string;
}

// ================================================
// MIDDLEWARE TYPES
// ================================================

export interface AuthMiddlewareOptions {
  required: boolean;           // Require authentication
  allowGuests: boolean;        // Allow guest sessions
  roles?: UserRole[];          // Required user roles
  permissions?: Permission[];  // Required permissions
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
}

export interface AuthMiddlewareResult {
  success: boolean;
  context?: AuthContext;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

// ================================================
// ERROR TYPES
// ================================================

export const AUTH_ERROR_CODES = {
  // Token errors
  INVALID_TOKEN: 'INVALID_TOKEN',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  MISSING_TOKEN: 'MISSING_TOKEN',
  MALFORMED_TOKEN: 'MALFORMED_TOKEN',
  
  // Session errors
  INVALID_SESSION: 'INVALID_SESSION',
  EXPIRED_SESSION: 'EXPIRED_SESSION',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  
  // User errors
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_INACTIVE: 'USER_INACTIVE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  
  // Authorization errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  INVALID_ROLE: 'INVALID_ROLE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // General
  AUTH_SERVICE_ERROR: 'AUTH_SERVICE_ERROR',
} as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  statusCode: number;
  details?: string;
}