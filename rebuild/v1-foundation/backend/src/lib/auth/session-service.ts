/**
 * LML v1 Foundation - Session Service
 * ===================================
 * Basic session management with Redis support
 * Created: 2025-08-05
 * Status: Phase 1 Auth Infrastructure
 */

import { createClient } from 'redis';
import { getConfig } from '../env';
import type { AuthUser } from './types';

// ================================================
// SESSION INTERFACES
// ================================================

export interface UserSession {
  sessionId: string;
  userId: number;
  email: string;
  role: string;
  createdAt: Date;
  lastActiveAt: Date;
  ipAddress: string;
  userAgent: string;
}

// ================================================
// SESSION SERVICE CLASS
// ================================================

export class SessionService {
  private redisClient: ReturnType<typeof createClient> | null = null;
  private useRedis: boolean = false;
  private sessionPrefix = 'session:';
  private sessionTTL = 86400; // 24 hours in seconds

  constructor() {
    const config = getConfig();
    
    // Use SESSION_REDIS_URL if available, otherwise fall back to main Redis
    if (config.auth.sessionRedisUrl) {
      this.useRedis = true;
      this.redisClient = createClient({
        url: config.auth.sessionRedisUrl,
      });
      this.initializeRedis();
    } else {
      // TODO: Could fall back to main Redis URL or use in-memory store
      console.warn('⚠️  No SESSION_REDIS_URL configured, sessions will be stateless');
    }
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.connect();
      console.log('✅ Session Redis connected');
    } catch (error) {
      console.error('❌ Session Redis connection failed:', error);
      this.useRedis = false;
    }
  }

  /**
   * Create a new session
   */
  async createSession(user: AuthUser, metadata: {
    ipAddress: string;
    userAgent: string;
  }): Promise<UserSession> {
    const sessionId = this.generateSessionId();
    const session: UserSession = {
      sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    };

    if (this.useRedis && this.redisClient) {
      try {
        await this.redisClient.setEx(
          `${this.sessionPrefix}${sessionId}`,
          this.sessionTTL,
          JSON.stringify(session)
        );
      } catch (error) {
        console.error('Failed to store session in Redis:', error);
      }
    }

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    if (!this.useRedis || !this.redisClient) {
      return null; // No session storage available
    }

    try {
      const sessionData = await this.redisClient.get(`${this.sessionPrefix}${sessionId}`);
      if (!sessionData) return null;

      const session = JSON.parse(sessionData) as UserSession;
      
      // Update last active time
      session.lastActiveAt = new Date();
      await this.redisClient.setEx(
        `${this.sessionPrefix}${sessionId}`,
        this.sessionTTL,
        JSON.stringify(session)
      );

      return session;
    } catch (error) {
      console.error('Failed to retrieve session from Redis:', error);
      return null;
    }
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    if (!this.useRedis || !this.redisClient) {
      return; // No session storage to invalidate
    }

    try {
      await this.redisClient.del(`${this.sessionPrefix}${sessionId}`);
    } catch (error) {
      console.error('Failed to invalidate session:', error);
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(userId: number): Promise<void> {
    if (!this.useRedis || !this.redisClient) {
      return;
    }

    try {
      // Get all session keys
      const keys = await this.redisClient.keys(`${this.sessionPrefix}*`);
      
      // Check each session to see if it belongs to the user
      const userSessions: string[] = [];
      for (const key of keys) {
        const sessionData = await this.redisClient.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData) as UserSession;
          if (session.userId === userId) {
            userSessions.push(key);
          }
        }
      }

      // Delete all user sessions
      for (const sessionKey of userSessions) {
        await this.redisClient.del(sessionKey);
      }
    } catch (error) {
      console.error('Failed to invalidate user sessions:', error);
    }
  }

  /**
   * Check if session service is available
   */
  isAvailable(): boolean {
    return this.useRedis && this.redisClient !== null;
  }

  /**
   * Generate a secure session ID
   */
  private generateSessionId(): string {
    return [
      Date.now().toString(36),
      Math.random().toString(36).substr(2, 9),
      Math.random().toString(36).substr(2, 9),
    ].join('');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        console.log('✅ Session Redis disconnected gracefully');
      } catch (error) {
        console.error('Error disconnecting session Redis:', error);
      }
    }
  }
}

// ================================================
// SINGLETON INSTANCE
// ================================================

export const sessionService = new SessionService();

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Create session for user
 */
export async function createUserSession(
  user: AuthUser,
  metadata: { ipAddress: string; userAgent: string }
): Promise<UserSession> {
  return sessionService.createSession(user, metadata);
}

/**
 * Validate session by ID
 */
export async function validateSession(sessionId: string): Promise<UserSession | null> {
  return sessionService.getSession(sessionId);
}

/**
 * Logout user (invalidate session)
 */
export async function logoutUser(sessionId: string): Promise<void> {
  return sessionService.invalidateSession(sessionId);
}

/**
 * Force logout user from all devices
 */
export async function logoutUserFromAllDevices(userId: number): Promise<void> {
  return sessionService.invalidateUserSessions(userId);
}