/**
 * LML v1 Foundation - Redis Key Generation Utilities
 * ===================================================
 * Centralized key generation and parsing logic
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import { REDIS_KEY_PATTERNS } from '../config/constants';

// ================================================
// LOCK ID GENERATION & PARSING
// ================================================

export function generateLockId(userId: string): string {
  return `${userId}:${Date.now()}`;
}

export function parseLockId(lockId: string): { userId: string; timestamp: number } {
  const [userId, timestampStr] = lockId.split(':');
  const timestamp = parseInt(timestampStr, 10);
  
  if (!userId || isNaN(timestamp)) {
    throw new Error(`Invalid lock ID format: ${lockId}`);
  }
  
  return { userId, timestamp };
}

// ================================================
// REDIS KEY GENERATION
// ================================================

export function generateSeatLockKey(showId: string, seatId: string): string {
  return REDIS_KEY_PATTERNS.SEAT_LOCK(showId, seatId);
}

export function generateShowLockPattern(showId: string): string {
  return REDIS_KEY_PATTERNS.SEAT_LOCK_SHOW_PATTERN(showId);
}

export function generateSeatEventsChannel(showId: string): string {
  return REDIS_KEY_PATTERNS.SEAT_EVENTS_CHANNEL(showId);
}

// ================================================
// REDIS KEY PARSING
// ================================================

export function parseSeatLockKey(key: string): { showId: string; seatId: string } {
  // Format: seat_lock:showId:seatId
  const parts = key.split(':');
  
  if (parts.length !== 3 || parts[0] !== 'seat_lock') {
    throw new Error(`Invalid seat lock key format: ${key}`);
  }
  
  const [, showId, seatId] = parts;
  
  if (!showId || !seatId) {
    throw new Error(`Invalid seat lock key components: ${key}`);
  }
  
  return { showId, seatId };
}

// ================================================
// VALIDATION UTILITIES
// ================================================

export function isValidLockId(lockId: string): boolean {
  try {
    parseLockId(lockId);
    return true;
  } catch {
    return false;
  }
}

export function isValidSeatLockKey(key: string): boolean {
  try {
    parseSeatLockKey(key);
    return true;
  } catch {
    return false;
  }
}

// ================================================
// LOCK EXPIRY UTILITIES
// ================================================

export function calculateLockExpiry(ttlSeconds: number): Date {
  return new Date(Date.now() + (ttlSeconds * 1000));
}

export function isLockExpired(lockId: string, ttlSeconds: number): boolean {
  try {
    const { timestamp } = parseLockId(lockId);
    const expiryTime = timestamp + (ttlSeconds * 1000);
    return Date.now() > expiryTime;
  } catch {
    return true; // Invalid lock ID is considered expired
  }
}