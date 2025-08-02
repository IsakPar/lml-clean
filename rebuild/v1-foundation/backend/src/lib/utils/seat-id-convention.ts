/**
 * LML v1 Foundation - Seat ID Convention
 * ======================================
 * Enforces consistent seat ID format across MongoDB and PostgreSQL
 * Convention: "section-row-number" (e.g., "stalls-A-5", "circle-B-12")
 * Created: 2025-08-01
 * Status: Phase 1 Hardening
 */

import { z } from 'zod';

// ================================================
// SEAT ID CONVENTION SCHEMA
// ================================================

export const seatIdSchema = z.string().regex(
  /^[a-z0-9_-]+-[A-Z0-9]+-(0[1-9]|[1-9][0-9]*)$/,
  'Seat ID must follow format: section-row-number (e.g., stalls-A-5)'
);

// ================================================
// SEAT ID TYPES
// ================================================

export interface ParsedSeatId {
  seatId: string;        // Full ID: "stalls-A-5"
  section: string;       // Section: "stalls"
  row: string;          // Row: "A"
  number: number;       // Number: 5
  isValid: boolean;
}

export interface SeatIdValidationResult {
  valid: boolean;
  errors: string[];
  parsed?: ParsedSeatId;
}

export interface SeatMappingValidation {
  totalSeats: number;
  validSeats: number;
  invalidSeats: string[];
  duplicateSeats: string[];
  missingInMongo: string[];
  missingInPostgres: string[];
  errors: string[];
}

// ================================================
// SEAT ID PARSING & VALIDATION
// ================================================

/**
 * Parse seat ID into components
 */
export function parseSeatId(seatId: string): ParsedSeatId {
  try {
    // Validate format first
    seatIdSchema.parse(seatId);
    
    // Split into components
    const parts = seatId.split('-');
    
    if (parts.length !== 3) {
      return {
        seatId,
        section: '',
        row: '',
        number: 0,
        isValid: false,
      };
    }
    
    const [section, row, numberStr] = parts;
    const number = parseInt(numberStr, 10);
    
    // Validate components
    if (!section || !row || isNaN(number) || number <= 0) {
      return {
        seatId,
        section,
        row,
        number,
        isValid: false,
      };
    }
    
    return {
      seatId,
      section: section.toLowerCase(),
      row: row.toUpperCase(),
      number,
      isValid: true,
    };
  } catch (error) {
    return {
      seatId,
      section: '',
      row: '',
      number: 0,
      isValid: false,
    };
  }
}

/**
 * Validate individual seat ID
 */
export function validateSeatId(seatId: string): SeatIdValidationResult {
  const parsed = parseSeatId(seatId);
  
  if (!parsed.isValid) {
    return {
      valid: false,
      errors: [`Invalid seat ID format: ${seatId}. Expected format: section-row-number (e.g., stalls-A-5)`],
    };
  }
  
  return {
    valid: true,
    errors: [],
    parsed,
  };
}

/**
 * Build seat ID from components
 */
export function buildSeatId(section: string, row: string, number: number): string {
  const seatId = `${section.toLowerCase()}-${row.toUpperCase()}-${number}`;
  
  // Validate the built ID
  const validation = validateSeatId(seatId);
  if (!validation.valid) {
    throw new Error(`Failed to build valid seat ID from components: ${section}, ${row}, ${number}`);
  }
  
  return seatId;
}

// ================================================
// SEAT MAPPING VALIDATION
// ================================================

/**
 * Validate seat mapping between MongoDB and PostgreSQL
 */
export function validateSeatMapping(
  mongoSeats: Array<{ id: string; [key: string]: any }>,
  postgresSeats?: Array<{ seatId: string; [key: string]: any }>
): SeatMappingValidation {
  const errors: string[] = [];
  const invalidSeats: string[] = [];
  const duplicateSeats: string[] = [];
  
  // Extract seat IDs
  const mongoSeatIds = mongoSeats.map(seat => seat.id);
  const postgresSeatIds = postgresSeats?.map(seat => seat.seatId) || [];
  
  // Check for duplicates in MongoDB
  const mongoIdCounts = new Map<string, number>();
  mongoSeatIds.forEach(id => {
    mongoIdCounts.set(id, (mongoIdCounts.get(id) || 0) + 1);
  });
  
  mongoIdCounts.forEach((count, id) => {
    if (count > 1) {
      duplicateSeats.push(id);
      errors.push(`Duplicate seat ID in MongoDB: ${id} (appears ${count} times)`);
    }
  });
  
  // Validate seat ID format
  let validSeats = 0;
  mongoSeatIds.forEach(seatId => {
    const validation = validateSeatId(seatId);
    if (validation.valid) {
      validSeats++;
    } else {
      invalidSeats.push(seatId);
      errors.push(`Invalid seat ID format: ${seatId}`);
    }
  });
  
  // Check mapping consistency (if PostgreSQL data provided)
  const missingInMongo = postgresSeatIds.filter(id => !mongoSeatIds.includes(id));
  const missingInPostgres = mongoSeatIds.filter(id => !postgresSeatIds.includes(id));
  
  if (missingInMongo.length > 0) {
    errors.push(`Seats in PostgreSQL but missing in MongoDB: ${missingInMongo.join(', ')}`);
  }
  
  if (missingInPostgres.length > 0) {
    errors.push(`Seats in MongoDB but missing in PostgreSQL: ${missingInPostgres.join(', ')}`);
  }
  
  return {
    totalSeats: mongoSeatIds.length,
    validSeats,
    invalidSeats,
    duplicateSeats,
    missingInMongo,
    missingInPostgres,
    errors,
  };
}

// ================================================
// SEAT ID UTILITIES
// ================================================

/**
 * Normalize seat ID to standard format
 */
export function normalizeSeatId(seatId: string): string {
  const parsed = parseSeatId(seatId);
  
  if (!parsed.isValid) {
    throw new Error(`Cannot normalize invalid seat ID: ${seatId}`);
  }
  
  return buildSeatId(parsed.section, parsed.row, parsed.number);
}

/**
 * Get section from seat ID
 */
export function getSectionFromSeatId(seatId: string): string {
  const parsed = parseSeatId(seatId);
  return parsed.section;
}

/**
 * Get row from seat ID
 */
export function getRowFromSeatId(seatId: string): string {
  const parsed = parseSeatId(seatId);
  return parsed.row;
}

/**
 * Get number from seat ID
 */
export function getNumberFromSeatId(seatId: string): number {
  const parsed = parseSeatId(seatId);
  return parsed.number;
}

/**
 * Group seats by section
 */
export function groupSeatsBySection(seatIds: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  
  seatIds.forEach(seatId => {
    const section = getSectionFromSeatId(seatId);
    if (section) {
      if (!sections[section]) {
        sections[section] = [];
      }
      sections[section].push(seatId);
    }
  });
  
  return sections;
}

/**
 * Group seats by row within a section
 */
export function groupSeatsByRow(seatIds: string[]): Record<string, Record<string, string[]>> {
  const sections = groupSeatsBySection(seatIds);
  const result: Record<string, Record<string, string[]>> = {};
  
  Object.entries(sections).forEach(([section, seats]) => {
    result[section] = {};
    
    seats.forEach(seatId => {
      const row = getRowFromSeatId(seatId);
      if (row) {
        if (!result[section][row]) {
          result[section][row] = [];
        }
        result[section][row].push(seatId);
      }
    });
  });
  
  return result;
}

// ================================================
// VALIDATION HELPERS
// ================================================

/**
 * Detect seat data desync between systems
 */
export function detectSeatDataDesync(
  mongoSeats: Array<{ id: string; [key: string]: any }>,
  postgresSeats?: Array<{ seatId: string; [key: string]: any }>
): {
  hasDesync: boolean;
  severity: 'low' | 'medium' | 'high';
  issues: string[];
} {
  const validation = validateSeatMapping(mongoSeats, postgresSeats);
  const issues: string[] = [];
  let severity: 'low' | 'medium' | 'high' = 'low';
  
  // Check for format issues
  if (validation.invalidSeats.length > 0) {
    issues.push(`${validation.invalidSeats.length} seats with invalid ID format`);
    severity = 'high';
  }
  
  // Check for duplicates
  if (validation.duplicateSeats.length > 0) {
    issues.push(`${validation.duplicateSeats.length} duplicate seat IDs`);
    severity = 'high';
  }
  
  // Check for mapping issues
  if (validation.missingInMongo.length > 0) {
    issues.push(`${validation.missingInMongo.length} seats missing in MongoDB`);
    if (severity !== 'high') severity = 'medium';
  }
  
  if (validation.missingInPostgres.length > 0) {
    issues.push(`${validation.missingInPostgres.length} seats missing in PostgreSQL`);
    if (severity !== 'high') severity = 'medium';
  }
  
  return {
    hasDesync: validation.errors.length > 0,
    severity,
    issues,
  };
}