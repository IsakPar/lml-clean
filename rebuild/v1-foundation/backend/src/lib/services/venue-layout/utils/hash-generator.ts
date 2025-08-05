/**
 * LML v1 Foundation - Layout Hash Generator
 * =========================================
 * Stable hash generation for layout deduplication and change detection
 * Created: 2025-08-05
 * Status: Phase 1 - Core Architecture (Fix #3: Hash Enforcement)
 */

import { createHash } from 'crypto';
import { VenueSeat, VenueSection, VenueZone } from '../config/schema-definitions';

// ================================================
// HASH GENERATION TYPES
// ================================================

interface LayoutHashInput {
  seats: VenueSeat[];
  sections?: VenueSection[];
  zones?: VenueZone[];
  viewport?: {
    width: number;
    height: number;
    scale: number;
  };
}

interface HashResult {
  hash: string;
  algorithm: string;
  timestamp: Date;
  inputSummary: {
    seatCount: number;
    sectionCount: number;
    zoneCount: number;
    hasViewport: boolean;
  };
}

// ================================================
// NORMALIZATION FUNCTIONS
// ================================================

/**
 * Normalize seat data for consistent hashing
 */
function normalizeSeat(seat: VenueSeat): any {
  return {
    seatId: seat.seatId.trim(),
    sectionId: seat.sectionId.trim(),
    row: seat.row.trim().toUpperCase(),
    number: seat.number.trim(),
    x: Math.round(seat.x * 100) / 100, // Round to 2 decimal places
    y: Math.round(seat.y * 100) / 100,
    isAccessible: seat.isAccessible || false,
    priceCategory: seat.priceCategory?.trim() || null,
    // Exclude 'status' from hash as it's operational, not structural
  };
}

/**
 * Normalize section data for consistent hashing
 */
function normalizeSection(section: VenueSection): any {
  return {
    sectionId: section.sectionId.trim(),
    name: section.name.trim(),
    color: section.color.trim().toLowerCase(),
    capacity: section.capacity,
    priceCategory: section.priceCategory.trim(),
  };
}

/**
 * Normalize zone data for consistent hashing
 */
function normalizeZone(zone: VenueZone): any {
  return {
    zoneId: zone.zoneId.trim(),
    type: zone.type,
    name: zone.name.trim(),
    coordinates: zone.coordinates.map(coord => ({
      x: Math.round(coord.x * 100) / 100,
      y: Math.round(coord.y * 100) / 100,
    })).sort((a, b) => a.x - b.x || a.y - b.y), // Sort for consistency
  };
}

/**
 * Normalize viewport for consistent hashing
 */
function normalizeViewport(viewport: { width: number; height: number; scale: number }): any {
  return {
    width: Math.round(viewport.width * 100) / 100,
    height: Math.round(viewport.height * 100) / 100,
    scale: Math.round(viewport.scale * 1000) / 1000, // More precision for scale
  };
}

// ================================================
// HASH GENERATION (Fix #3)
// ================================================

/**
 * Generate stable hash for layout data
 */
export function generateLayoutHash(input: LayoutHashInput): string {
  try {
    // Normalize and sort all components for consistent hashing
    const normalizedData = {
      seats: input.seats
        .map(normalizeSeat)
        .sort((a, b) => a.seatId.localeCompare(b.seatId)),
      
      sections: (input.sections || [])
        .map(normalizeSection)
        .sort((a, b) => a.sectionId.localeCompare(b.sectionId)),
      
      zones: (input.zones || [])
        .map(normalizeZone)
        .sort((a, b) => a.zoneId.localeCompare(b.zoneId)),
      
      viewport: input.viewport ? normalizeViewport(input.viewport) : null,
    };
    
    // Create deterministic JSON string
    const jsonString = JSON.stringify(normalizedData, null, 0);
    
    // Generate SHA-256 hash
    const hash = createHash('sha256')
      .update(jsonString, 'utf8')
      .digest('hex');
    
    return hash;
    
  } catch (error) {
    console.error('Hash generation error:', error);
    throw new Error(`Failed to generate layout hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate detailed hash result with metadata
 */
export function generateLayoutHashWithMetadata(input: LayoutHashInput): HashResult {
  const hash = generateLayoutHash(input);
  
  return {
    hash,
    algorithm: 'SHA-256',
    timestamp: new Date(),
    inputSummary: {
      seatCount: input.seats.length,
      sectionCount: input.sections?.length || 0,
      zoneCount: input.zones?.length || 0,
      hasViewport: !!input.viewport,
    },
  };
}

// ================================================
// HASH VALIDATION (Fix #3)
// ================================================

/**
 * Validate that a layout hash matches the current data
 */
export function validateLayoutHash(
  input: LayoutHashInput,
  expectedHash: string
): {
  isValid: boolean;
  currentHash: string;
  expectedHash: string;
  difference?: string;
} {
  try {
    const currentHash = generateLayoutHash(input);
    const isValid = currentHash === expectedHash;
    
    const result = {
      isValid,
      currentHash,
      expectedHash,
    };
    
    if (!isValid) {
      // Provide helpful difference information
      return {
        ...result,
        difference: 'Layout data has changed since last hash generation',
      };
    }
    
    return result;
    
  } catch (error) {
    return {
      isValid: false,
      currentHash: '',
      expectedHash,
      difference: `Hash validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check if two layouts are identical by comparing hashes
 */
export function areLayoutsIdentical(layout1: LayoutHashInput, layout2: LayoutHashInput): boolean {
  try {
    const hash1 = generateLayoutHash(layout1);
    const hash2 = generateLayoutHash(layout2);
    return hash1 === hash2;
  } catch {
    return false;
  }
}

// ================================================
// HASH COMPARISON & ANALYSIS
// ================================================

/**
 * Compare two layout hashes and identify what changed
 */
export function compareLayoutHashes(
  oldInput: LayoutHashInput,
  newInput: LayoutHashInput
): {
  hasChanged: boolean;
  changes: string[];
  oldHash: string;
  newHash: string;
} {
  const oldHash = generateLayoutHash(oldInput);
  const newHash = generateLayoutHash(newInput);
  const hasChanged = oldHash !== newHash;
  
  if (!hasChanged) {
    return {
      hasChanged: false,
      changes: [],
      oldHash,
      newHash,
    };
  }
  
  // Analyze what changed
  const changes: string[] = [];
  
  // Check seat changes
  if (oldInput.seats.length !== newInput.seats.length) {
    changes.push(`Seat count changed: ${oldInput.seats.length} → ${newInput.seats.length}`);
  } else {
    const oldSeatHash = createHash('sha256').update(JSON.stringify(oldInput.seats.map(normalizeSeat).sort((a, b) => a.seatId.localeCompare(b.seatId)))).digest('hex');
    const newSeatHash = createHash('sha256').update(JSON.stringify(newInput.seats.map(normalizeSeat).sort((a, b) => a.seatId.localeCompare(b.seatId)))).digest('hex');
    
    if (oldSeatHash !== newSeatHash) {
      changes.push('Seat data modified');
    }
  }
  
  // Check section changes
  const oldSectionCount = oldInput.sections?.length || 0;
  const newSectionCount = newInput.sections?.length || 0;
  
  if (oldSectionCount !== newSectionCount) {
    changes.push(`Section count changed: ${oldSectionCount} → ${newSectionCount}`);
  } else if (oldSectionCount > 0) {
    const oldSectionHash = createHash('sha256').update(JSON.stringify((oldInput.sections || []).map(normalizeSection).sort((a, b) => a.sectionId.localeCompare(b.sectionId)))).digest('hex');
    const newSectionHash = createHash('sha256').update(JSON.stringify((newInput.sections || []).map(normalizeSection).sort((a, b) => a.sectionId.localeCompare(b.sectionId)))).digest('hex');
    
    if (oldSectionHash !== newSectionHash) {
      changes.push('Section data modified');
    }
  }
  
  // Check zone changes
  const oldZoneCount = oldInput.zones?.length || 0;
  const newZoneCount = newInput.zones?.length || 0;
  
  if (oldZoneCount !== newZoneCount) {
    changes.push(`Zone count changed: ${oldZoneCount} → ${newZoneCount}`);
  } else if (oldZoneCount > 0) {
    const oldZoneHash = createHash('sha256').update(JSON.stringify((oldInput.zones || []).map(normalizeZone).sort((a, b) => a.zoneId.localeCompare(b.zoneId)))).digest('hex');
    const newZoneHash = createHash('sha256').update(JSON.stringify((newInput.zones || []).map(normalizeZone).sort((a, b) => a.zoneId.localeCompare(b.zoneId)))).digest('hex');
    
    if (oldZoneHash !== newZoneHash) {
      changes.push('Zone data modified');
    }
  }
  
  // Check viewport changes
  const oldViewportHash = oldInput.viewport ? createHash('sha256').update(JSON.stringify(normalizeViewport(oldInput.viewport))).digest('hex') : null;
  const newViewportHash = newInput.viewport ? createHash('sha256').update(JSON.stringify(normalizeViewport(newInput.viewport))).digest('hex') : null;
  
  if (oldViewportHash !== newViewportHash) {
    changes.push('Viewport configuration changed');
  }
  
  return {
    hasChanged,
    changes,
    oldHash,
    newHash,
  };
}

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Generate short hash (first 8 characters) for display purposes
 */
export function generateShortHash(input: LayoutHashInput): string {
  return generateLayoutHash(input).substring(0, 8);
}

/**
 * Verify hash format is valid
 */
export function isValidHashFormat(hash: string): boolean {
  // SHA-256 hash should be 64 hexadecimal characters
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Generate hash for testing/debugging
 */
export function generateTestHash(testData: any): string {
  return createHash('sha256')
    .update(JSON.stringify(testData))
    .digest('hex');
}