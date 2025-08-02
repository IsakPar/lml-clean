/**
 * LML v1 Foundation - Seat ID Generation Utility
 * ==============================================
 * Deterministic seat ID generation using SHA-256 hashing
 * Implementation of approved plan for globally unique seat identifiers
 */

import { createHash } from 'crypto';

/**
 * Generate deterministic seat ID using SHA-256 hash
 * Format: sha256(`${layoutId}_${section}_${row}_${number}`)
 * 
 * @param layoutId - Layout identifier
 * @param section - Seat section
 * @param row - Seat row 
 * @param number - Seat number
 * @returns 64-character hex string (SHA-256 hash)
 */
export function generateSeatId(
  layoutId: string, 
  section: string, 
  row: string, 
  number: number
): string {
  const seatIdentifier = `${layoutId}_${section}_${row}_${number}`;
  return createHash('sha256').update(seatIdentifier, 'utf8').digest('hex');
}

/**
 * Validate that a seat ID matches expected hash
 * 
 * @param seatId - Actual seat ID to validate
 * @param layoutId - Layout identifier
 * @param section - Seat section
 * @param row - Seat row
 * @param number - Seat number
 * @returns true if seat ID is valid
 */
export function validateSeatId(
  seatId: string,
  layoutId: string,
  section: string,
  row: string,
  number: number
): boolean {
  const expectedSeatId = generateSeatId(layoutId, section, row, number);
  return seatId === expectedSeatId;
}

/**
 * Generate seat IDs for an array of seats
 * 
 * @param layoutId - Layout identifier
 * @param seats - Array of seat objects (will be mutated to add seatId)
 */
export function generateSeatIds(layoutId: string, seats: any[]): void {
  seats.forEach(seat => {
    if (!seat.seatId) {
      seat.seatId = generateSeatId(layoutId, seat.section, seat.row, seat.number);
    }
  });
}

/**
 * Validate all seat IDs in a layout
 * 
 * @param layoutId - Layout identifier
 * @param seats - Array of seats to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateAllSeatIds(layoutId: string, seats: any[]): string[] {
  const errors: string[] = [];
  const seatIds = new Set<string>();
  
  seats.forEach((seat, index) => {
    // Check if seat ID exists
    if (!seat.seatId) {
      errors.push(`Seat at index ${index} missing seatId`);
      return;
    }
    
    // Check if seat ID is correct format (64-char hex)
    if (!/^[a-f0-9]{64}$/.test(seat.seatId)) {
      errors.push(`Seat ${seat.section}-${seat.row}-${seat.number}: Invalid seatId format`);
      return;
    }
    
    // Check for duplicates
    if (seatIds.has(seat.seatId)) {
      errors.push(`Duplicate seatId detected: ${seat.seatId}`);
      return;
    }
    seatIds.add(seat.seatId);
    
    // Validate seat ID matches expected value
    const expectedSeatId = generateSeatId(layoutId, seat.section, seat.row, seat.number);
    if (seat.seatId !== expectedSeatId) {
      errors.push(`Seat ${seat.section}-${seat.row}-${seat.number}: SeatId mismatch. Expected: ${expectedSeatId}, Got: ${seat.seatId}`);
    }
  });
  
  return errors;
}

/**
 * Generate layout hash for change detection
 * Based on normalized content (seats, viewport, zones)
 * 
 * @param layout - Layout object with seats, viewport, zones
 * @returns SHA-256 hash of normalized content
 */
export function generateLayoutHash(layout: {
  seats: any[];
  viewport?: any;
  zones?: any[];
  layoutType?: string;
}): string {
  // Normalize content for consistent hashing
  const normalizedContent = {
    seats: layout.seats.map(seat => ({
      seatId: seat.seatId,
      section: seat.section,
      row: seat.row,
      number: seat.number,
      x: seat.x,
      y: seat.y,
      category: seat.category,
      color: seat.color
    })).sort((a, b) => a.seatId.localeCompare(b.seatId)), // Sort for consistency
    viewport: layout.viewport || null,
    zones: layout.zones || [],
    layoutType: layout.layoutType || 'seated'
  };
  
  const contentString = JSON.stringify(normalizedContent);
  return createHash('sha256').update(contentString, 'utf8').digest('hex');
}

/**
 * Validate layout hash against current content
 * 
 * @param layout - Layout object with layoutHash and content
 * @returns true if stored hash matches current content
 */
export function validateLayoutHash(layout: any): boolean {
  if (!layout.layoutHash) {
    return false;
  }
  
  const currentHash = generateLayoutHash(layout);
  return layout.layoutHash === currentHash;
}

/**
 * Constants for seat ID validation
 */
export const SEAT_ID_CONSTANTS = {
  HASH_LENGTH: 64,
  HASH_PATTERN: /^[a-f0-9]{64}$/,
  MAX_SEATS_PER_LAYOUT: 10000, // Reasonable limit for performance
} as const;