/**
 * LML v1 Foundation - Security Validation Utilities
 * =================================================
 * Pure utility functions for input validation and sanitization
 * Migrated from: src/lib/db/queries.ts (lines 23-70)
 * Migration Date: 2025-08-01
 * Status: FOUNDATION APPROVED ✅
 */

/**
 * Validate and sanitize UUID parameters to prevent injection attacks
 */
export function validateUUID(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new Error(`Invalid UUID format: ${id}`);
  }
  return id;
}

/**
 * Sanitize text input to prevent XSS attacks
 */
export function sanitizeText(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  
  // Remove HTML tags and encode special characters
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim()
    .substring(0, 1000); // Limit length to prevent DoS
}

/**
 * Validate email format with additional security checks
 */
export function validateEmail(email: string): string {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const sanitized = sanitizeText(email);
  
  if (!sanitized || !emailRegex.test(sanitized) || sanitized.length > 254) {
    throw new Error('Invalid email format');
  }
  
  return sanitized;
}

/**
 * Validate and sanitize numeric ID parameters
 */
export function validateNumericId(id: string | number): number {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  
  if (isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
    throw new Error(`Invalid numeric ID: ${id}`);
  }
  
  return numId;
}

/**
 * Validate and sanitize slug parameters (for show slugs, venue IDs)
 */
export function validateSlug(slug: string): string {
  const slugRegex = /^[a-z0-9-_]+$/i;
  const sanitized = sanitizeText(slug);
  
  if (!sanitized || !slugRegex.test(sanitized) || sanitized.length > 100) {
    throw new Error(`Invalid slug format: ${slug}`);
  }
  
  return sanitized.toLowerCase();
}

/**
 * Validate seat ID format (e.g., "stalls-A-12")
 */
export function validateSeatId(seatId: string): string {
  const seatIdRegex = /^[a-z0-9-]+$/i;
  const sanitized = sanitizeText(seatId);
  
  if (!sanitized || !seatIdRegex.test(sanitized) || sanitized.length > 50) {
    throw new Error(`Invalid seat ID format: ${seatId}`);
  }
  
  return sanitized.toLowerCase();
}