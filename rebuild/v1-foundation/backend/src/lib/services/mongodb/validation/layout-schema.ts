/**
 * LML v1 Foundation - Layout Schema Validation
 * ============================================
 * MongoDB JSON schema validation for venue layouts
 * Implementation of approved production-grade schema
 */

import { VenueLayout, VenueSeat } from '../types/venue-layout';
import { generateSeatId, validateAllSeatIds, generateLayoutHash } from '../utils/seat-id-generator';

/**
 * MongoDB JSON Schema for Layout Collection
 * Enforces data structure and validation rules at database level
 */
export const LAYOUT_COLLECTION_SCHEMA = {
  $jsonSchema: {
    bsonType: "object",
    required: ["layoutId", "venueId", "name", "version", "status", "seats", "layoutHash", "createdAt", "updatedAt"],
    additionalProperties: true, // Allow for future extensions
    properties: {
      layoutId: {
        bsonType: "string",
        pattern: "^[a-zA-Z0-9-]+$",
        description: "Unique layout identifier"
      },
      venueId: {
        bsonType: "string", 
        description: "Venue identifier"
      },
      name: {
        bsonType: "string",
        maxLength: 255,
        description: "Human-readable layout name"
      },
      version: {
        bsonType: "string",
        pattern: "^\\d+\\.\\d+\\.\\d+$",
        description: "Semantic version (e.g., 1.2.3)"
      },
      status: {
        bsonType: "string",
        enum: ["draft", "published", "deployed"],
        description: "Layout lifecycle status"
      },
      layoutType: {
        bsonType: "string",
        enum: ["seated", "standing", "hybrid"],
        description: "Layout type for rendering and pricing"
      },
      viewport: {
        bsonType: "object",
        properties: {
          width: {
            bsonType: "number",
            minimum: 1,
            description: "Canvas width"
          },
          height: {
            bsonType: "number", 
            minimum: 1,
            description: "Canvas height"
          },
          unit: {
            bsonType: "string",
            enum: ["relative", "px"],
            description: "Unit type for rendering"
          },
          scale: {
            bsonType: "number",
            minimum: 0.1,
            maximum: 10,
            description: "Optional scale factor"
          }
        },
        additionalProperties: false
      },
      seats: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["seatId", "section", "row", "number", "x", "y"],
          additionalProperties: false,
          properties: {
            seatId: {
              bsonType: "string",
              pattern: "^[a-f0-9]{64}$",
              description: "SHA-256 hash seat identifier"
            },
            section: {
              bsonType: "string",
              maxLength: 50,
              description: "Section identifier"
            },
            row: {
              bsonType: "string", 
              maxLength: 10,
              description: "Row identifier"
            },
            number: {
              bsonType: "int",
              minimum: 1,
              description: "Seat number within row"
            },
            x: {
              bsonType: "number",
              minimum: 0,
              maximum: 1,
              description: "Normalized X coordinate"
            },
            y: {
              bsonType: "number",
              minimum: 0, 
              maximum: 1,
              description: "Normalized Y coordinate"
            },
            color: {
              bsonType: "string",
              pattern: "^#[0-9a-fA-F]{6}$|^(red|blue|green|yellow|purple)$",
              description: "Seat color (hex or predefined)"
            },
            category: {
              bsonType: "string",
              enum: ["premium", "standard", "economy", "accessible"],
              description: "Seat category"
            },
            facing: {
              bsonType: "string",
              enum: ["stage", "center", "forward"],
              description: "Seat orientation"
            },
            disabled: {
              bsonType: "bool",
              description: "Seat availability status"
            }
          }
        }
      },
      layoutHash: {
        bsonType: "string",
        pattern: "^[a-f0-9]{64}$",
        description: "SHA-256 hash of layout content"
      },
      publishedAt: {
        bsonType: "date",
        description: "Publication timestamp"
      },
      deployedAt: {
        bsonType: "date", 
        description: "Deployment timestamp"
      },
      createdAt: {
        bsonType: "date",
        description: "Creation timestamp"
      },
      updatedAt: {
        bsonType: "date",
        description: "Last update timestamp"
      }
    }
  }
};

/**
 * Validation errors for layout operations
 */
export class LayoutValidationError extends Error {
  constructor(message: string, public errors: string[] = []) {
    super(message);
    this.name = 'LayoutValidationError';
  }
}

export class ImmutabilityViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImmutabilityViolationError';
  }
}

/**
 * Validate layout before save
 * Ensures data integrity and business rules
 */
export function validateLayout(layout: Partial<VenueLayout>): string[] {
  const errors: string[] = [];
  
  // Required field validation
  if (!layout.layoutId) errors.push('layoutId is required');
  if (!layout.venueId) errors.push('venueId is required');
  if (!layout.name) errors.push('name is required');
  if (!layout.version) errors.push('version is required');
  if (!layout.status) errors.push('status is required');
  if (!layout.seats || layout.seats.length === 0) errors.push('seats array is required and cannot be empty');
  
  // Version format validation
  if (layout.version && !/^\d+\.\d+\.\d+$/.test(layout.version)) {
    errors.push('version must follow semantic versioning (e.g., 1.2.3)');
  }
  
  // Status validation
  if (layout.status && !['draft', 'published', 'deployed'].includes(layout.status)) {
    errors.push('status must be draft, published, or deployed');
  }
  
  // Layout type validation
  if (layout.layoutType && !['seated', 'standing', 'hybrid'].includes(layout.layoutType)) {
    errors.push('layoutType must be seated, standing, or hybrid');
  }
  
  // Viewport validation
  if (layout.viewport) {
    if (typeof layout.viewport.width !== 'number' || layout.viewport.width < 1) {
      errors.push('viewport.width must be a number >= 1');
    }
    if (typeof layout.viewport.height !== 'number' || layout.viewport.height < 1) {
      errors.push('viewport.height must be a number >= 1');
    }
    if (layout.viewport.unit && !['relative', 'px'].includes(layout.viewport.unit)) {
      errors.push('viewport.unit must be relative or px');
    }
  }
  
  // Seat validation
  if (layout.seats && layout.layoutId) {
    // Validate seat structure and coordinates
    layout.seats.forEach((seat, index) => {
      if (typeof seat.x !== 'number' || seat.x < 0 || seat.x > 1) {
        errors.push(`Seat ${index}: x coordinate must be between 0 and 1`);
      }
      if (typeof seat.y !== 'number' || seat.y < 0 || seat.y > 1) {
        errors.push(`Seat ${index}: y coordinate must be between 0 and 1`);
      }
      if (!seat.section) {
        errors.push(`Seat ${index}: section is required`);
      }
      if (!seat.row) {
        errors.push(`Seat ${index}: row is required`);
      }
      if (typeof seat.number !== 'number' || seat.number < 1) {
        errors.push(`Seat ${index}: number must be a positive integer`);
      }
    });
    
    // Validate seat IDs
    const seatIdErrors = validateAllSeatIds(layout.layoutId, layout.seats);
    errors.push(...seatIdErrors);
    
    // Check for duplicate seat positions (section, row, number)
    const seatPositions = new Set<string>();
    layout.seats.forEach(seat => {
      const position = `${seat.section}-${seat.row}-${seat.number}`;
      if (seatPositions.has(position)) {
        errors.push(`Duplicate seat position: ${position}`);
      }
      seatPositions.add(position);
    });
  }
  
  return errors;
}

/**
 * Pre-save middleware for layout validation
 * Generates seat IDs and layout hash if missing
 */
export function prepareLayoutForSave(layout: Partial<VenueLayout>): Partial<VenueLayout> {
  const preparedLayout = { ...layout };
  
  // Set default values
  if (!preparedLayout.layoutType) {
    preparedLayout.layoutType = 'seated';
  }
  
  if (!preparedLayout.status) {
    preparedLayout.status = 'draft';
  }
  
  // Generate seat IDs if missing
  if (preparedLayout.seats && preparedLayout.layoutId) {
    preparedLayout.seats.forEach(seat => {
      if (!seat.seatId) {
        seat.seatId = generateSeatId(
          preparedLayout.layoutId!,
          seat.section,
          seat.row,
          seat.number
        );
      }
    });
  }
  
  // Generate layout hash
  if (preparedLayout.seats) {
    preparedLayout.layoutHash = generateLayoutHash(preparedLayout);
  }
  
  // Set timestamps
  const now = new Date();
  if (!preparedLayout.createdAt) {
    preparedLayout.createdAt = now;
  }
  preparedLayout.updatedAt = now;
  
  return preparedLayout;
}

/**
 * Validate immutability constraints
 * Published and deployed layouts cannot be modified (except status transitions)
 */
export function validateImmutability(
  existingLayout: VenueLayout,
  updates: Partial<VenueLayout>
): void {
  if (existingLayout.status === 'published' || existingLayout.status === 'deployed') {
    const allowedUpdates = ['status', 'deployedAt', 'publishedAt', 'updatedAt'];
    const updateKeys = Object.keys(updates);
    
    // Check for status transitions
    if (updates.status) {
      if (existingLayout.status === 'published' && updates.status !== 'deployed') {
        throw new ImmutabilityViolationError(
          'Published layouts can only transition to deployed status'
        );
      }
      if (existingLayout.status === 'deployed') {
        throw new ImmutabilityViolationError(
          'Deployed layouts cannot change status'
        );
      }
    }
    
    // Check for forbidden updates
    const forbiddenUpdates = updateKeys.filter(key => !allowedUpdates.includes(key));
    if (forbiddenUpdates.length > 0) {
      throw new ImmutabilityViolationError(
        `Cannot modify ${existingLayout.status} layout. Forbidden updates: ${forbiddenUpdates.join(', ')}`
      );
    }
  }
}

/**
 * Layout validation constants
 */
export const LAYOUT_VALIDATION_CONSTANTS = {
  MAX_SEATS_PER_LAYOUT: 10000,
  MAX_NAME_LENGTH: 255,
  MAX_SECTION_NAME_LENGTH: 50,
  MAX_ROW_NAME_LENGTH: 10,
  ALLOWED_STATUSES: ['draft', 'published', 'deployed'] as const,
  ALLOWED_LAYOUT_TYPES: ['seated', 'standing', 'hybrid'] as const,
  ALLOWED_SEAT_CATEGORIES: ['premium', 'standard', 'economy', 'accessible'] as const,
} as const;