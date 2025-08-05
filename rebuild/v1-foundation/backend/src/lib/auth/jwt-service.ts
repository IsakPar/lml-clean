/**
 * LML v1 Foundation - JWT Service
 * ================================
 * Production JWT service using environment variables
 * Created: 2025-08-05
 * Status: Phase 1 Auth Infrastructure
 */

import { SignJWT, jwtVerify } from 'jose';
import { getConfig } from '../env';
import type { JWTPayload, AuthUser, UserRole } from './types';

// ================================================
// JWT SERVICE CLASS
// ================================================

export class JWTService {
  private secret: Uint8Array;
  private issuer: string;
  private audience: string;
  private expiresIn: string;

  constructor() {
    const config = getConfig();
    this.secret = new TextEncoder().encode(config.auth.jwtSecret);
    this.issuer = 'lml-v1-foundation';
    this.audience = 'lml-app';
    this.expiresIn = config.auth.jwtExpiresIn;
  }

  /**
   * Generate JWT token for authenticated user
   */
  async generateToken(user: AuthUser, sessionId: string = 'default'): Promise<string> {
    const payload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
      sessionId,
    };

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setSubject(user.id.toString())
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime(this.expiresIn)
      .sign(this.secret);

    return jwt;
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<any> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
      });

      return payload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader) return null;
    
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) return null;
    
    return token;
  }

  /**
   * Generate token for user session
   */
  async generateSessionToken(user: AuthUser, sessionId: string): Promise<string> {
    return this.generateToken(user, sessionId);
  }

  /**
   * Parse expiry string to seconds
   * Supports: '1h', '30m', '7d', '15s'
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default to 1 hour
    
    const [, amount, unit] = match;
    const value = parseInt(amount);
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }
}

// ================================================
// SINGLETON INSTANCE
// ================================================

export const jwtService = new JWTService();

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Quick token generation for authenticated user
 */
export async function createJWT(user: AuthUser): Promise<string> {
  return jwtService.generateToken(user);
}

/**
 * Quick token verification
 */
export async function verifyJWT(token: string): Promise<any> {
  return jwtService.verifyToken(token);
}

/**
 * Extract user ID from token
 */
export async function extractUserIdFromJWT(token: string): Promise<number | null> {
  try {
    const payload = await verifyJWT(token);
    return parseInt(payload.sub);
  } catch {
    return null;
  }
}