/**
 * Hash Operations Module
 * ======================
 * Core hash generation, validation, and utility functions
 * Extracted from hash-validator.ts for modularity
 */

import { createHash } from 'crypto';
import type { LayoutHashResult, HashOptions } from '../utils/hash-validator';

/**
 * Create canonical JSON string for consistent hashing
 */
export function createCanonicalJson(data: any): string {
  return JSON.stringify(data, Object.keys(data).sort());
}

/**
 * Validate hash result for correctness
 */
export function validateHashResult(hash: string, version: string, computationTimeMs: number): boolean {
  // Check hash format (64 character hex string)
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return false;
  }
  
  // Check version format
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return false;
  }
  
  // Check computation time is reasonable
  if (computationTimeMs < 0 || computationTimeMs > 10000) { // Max 10 seconds
    return false;
  }
  
  return true;
}

/**
 * Count layout elements for metrics
 */
export function countLayoutElements(data: any): number {
  if (!data || typeof data !== 'object') {
    return 1;
  }
  
  if (Array.isArray(data)) {
    return data.reduce((count, item) => count + countLayoutElements(item), 0);
  }
  
  // Count seats, sections, and other layout elements
  let count = 0;
  
  if (data.seats && Array.isArray(data.seats)) {
    count += data.seats.length;
  }
  
  if (data.sections && Array.isArray(data.sections)) {
    count += data.sections.length;
  }
  
  if (data.rows && Array.isArray(data.rows)) {
    count += data.rows.length;
  }
  
  // Count nested elements
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'seats' && key !== 'sections' && key !== 'rows') {
      if (typeof value === 'object' && value !== null) {
        count += countLayoutElements(value);
      }
    }
  }
  
  return Math.max(1, count);
}

/**
 * Verify hash integrity by recalculating
 */
export function verifyHashIntegrity(
  layoutData: any, 
  expectedHash: string,
  options: HashOptions = {}
): { valid: boolean; actualHash: string; timingMs: number } {
  const startTime = performance.now();
  
  // Simplified hash calculation for verification
  const canonicalJson = createCanonicalJson(layoutData);
  const actualHash = createHash('sha256')
    .update(canonicalJson, 'utf8')
    .digest('hex');
  
  const endTime = performance.now();
  
  return {
    valid: actualHash === expectedHash,
    actualHash,
    timingMs: endTime - startTime,
  };
}

/**
 * Generate SHA-256 hash for layout data
 */
export function generateSimpleHash(data: any): string {
  const canonicalJson = createCanonicalJson(data);
  return createHash('sha256')
    .update(canonicalJson, 'utf8')
    .digest('hex');
}

/**
 * Constants for hash operations
 */
export const HASH_OPERATIONS_CONSTANTS = {
  /** SHA-256 hash length */
  HASH_LENGTH: 64,
  
  /** Maximum computation time in milliseconds */
  MAX_COMPUTATION_TIME_MS: 10000,
  
  /** Hash algorithm */
  ALGORITHM: 'sha256',
  
  /** Hash format regex */
  HASH_FORMAT_REGEX: /^[a-f0-9]{64}$/i,
  
  /** Version format regex */
  VERSION_FORMAT_REGEX: /^\d+\.\d+\.\d+/,
} as const;
