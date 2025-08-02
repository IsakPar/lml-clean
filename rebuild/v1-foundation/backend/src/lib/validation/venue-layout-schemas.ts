/**
 * LML v1 Foundation - Venue Layout Validation Schemas
 * ====================================================
 * Zod schemas for runtime validation of venue layout data
 * Created: 2025-08-02
 * Status: Phase 2 - Enterprise Schema Validation
 */

import { z } from 'zod';
import type {
  VenueLayout,
  VenueSection,
  VenueSeat,
  ViewportConfig,
  AccessibilityInfo,
  LayoutStatus,
  SectionType,
  SeatType,
  SeatShape,
  AccessibilityFeature,
  CDNLayoutExport
} from '../types/venue-layout';

// ================================================
// UTILITY VALIDATORS
// ================================================

// UUID validation (strict RFC 4122 format)
const UUIDSchema = z.string().uuid('Must be a valid UUID');

// Semver validation (major.minor.patch)
const SemverSchema = z.string().regex(
  /^(\d+)\.(\d+)\.(\d+)$/,
  'Must be valid semantic version (e.g., "1.2.3")'
);

// SHA-256 hash validation
const SHA256Schema = z.string().regex(
  /^[a-f0-9]{64}$/i,
  'Must be a valid SHA-256 hash (64 hexadecimal characters)'
);

// Normalized coordinate (0.0 to 1.0)
const NormalizedCoordinate = z.number()
  .min(0, 'Coordinate must be >= 0')
  .max(1, 'Coordinate must be <= 1');

// Positive number validation
const PositiveNumber = z.number().positive('Must be a positive number');

// Hex color validation
const HexColorSchema = z.string().regex(
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  'Must be a valid hex color (e.g., "#FF5733" or "#F53")'
).optional();

// ================================================
// ENUM SCHEMAS
// ================================================

const LayoutStatusSchema = z.enum(['draft', 'active', 'deprecated'], {
  errorMap: () => ({ message: 'Status must be draft, active, or deprecated' })
});

const SectionTypeSchema = z.enum([
  'general', 'premium', 'accessible', 'standing', 'box', 'balcony'
], {
  errorMap: () => ({ message: 'Invalid section type' })
});

const SeatTypeSchema = z.enum([
  'standard', 'accessible', 'premium', 'companion', 'aisle', 'restricted'
], {
  errorMap: () => ({ message: 'Invalid seat type' })
});

const SeatShapeSchema = z.enum(['rectangle', 'circle', 'oval', 'custom'], {
  errorMap: () => ({ message: 'Invalid seat shape' })
});

const AccessibilityFeatureSchema = z.enum([
  'wheelchair_space', 'companion_seat', 'hearing_loop', 
  'sight_line_clear', 'easy_access', 'transfer_seat'
], {
  errorMap: () => ({ message: 'Invalid accessibility feature' })
});

// ================================================
// CORE SCHEMAS
// ================================================

export const ViewportConfigSchema = z.object({
  width: PositiveNumber,
  height: PositiveNumber,
  scale_factor: z.number().min(0.1).max(10).default(1.0),
  min_scale: z.number().min(0.01).max(1).default(0.1),
  max_scale: z.number().min(1).max(20).default(5.0),
  coordinate_system: z.literal('normalized'),
  origin: z.literal('top-left')
}).strict().refine(
  (data) => data.min_scale <= data.scale_factor && data.scale_factor <= data.max_scale,
  {
    message: 'scale_factor must be between min_scale and max_scale',
    path: ['scale_factor']
  }
);

export const AccessibilityInfoSchema = z.object({
  wheelchair_accessible: z.boolean(),
  hearing_loop: z.boolean(),
  sight_impaired_support: z.boolean(),
  companion_seats_available: z.boolean(),
  accessible_routes: z.array(z.string().min(1, 'Route description cannot be empty'))
}).strict();

export const VenueSeatSchema = z.object({
  // IDENTIFIERS
  seat_id: UUIDSchema,
  row: z.string().min(1, 'Row cannot be empty').max(5, 'Row too long'),
  number: z.number().int().positive('Seat number must be positive'),
  
  // COORDINATES
  x: NormalizedCoordinate,
  y: NormalizedCoordinate,
  width: PositiveNumber.optional(),
  height: PositiveNumber.optional(),
  rotation: z.number().min(0).max(360).optional(),
  
  // CLASSIFICATION
  seat_type: SeatTypeSchema,
  accessibility_features: z.array(AccessibilityFeatureSchema).optional(),
  
  // RELATIONSHIPS
  adjacent_seats: z.array(UUIDSchema).optional(),
  companion_seat: UUIDSchema.optional(),
  
  // VISUAL
  shape: SeatShapeSchema.optional().default('rectangle'),
  color_override: HexColorSchema
}).strict();

export const VenueSectionSchema = z.object({
  // IDENTIFIERS
  section_id: UUIDSchema,
  section_name: z.string().min(1, 'Section name required').max(50, 'Section name too long'),
  section_code: z.string().min(1, 'Section code required').max(10, 'Section code too long'),
  section_type: SectionTypeSchema,
  
  // DISPLAY
  display_order: z.number().int().min(0, 'Display order must be non-negative'),
  background_color: HexColorSchema,
  border_color: HexColorSchema,
  
  // BUSINESS LOGIC
  pricing_category: z.string().min(1, 'Pricing category required'),
  
  // DATA
  seats: z.array(VenueSeatSchema).min(1, 'Section must have at least one seat'),
  total_capacity: PositiveNumber,
  accessibility_info: AccessibilityInfoSchema.optional()
}).strict().refine(
  (data) => data.total_capacity === data.seats.length,
  {
    message: 'total_capacity must equal the number of seats',
    path: ['total_capacity']
  }
);

export const VenueLayoutSchema = z.object({
  // IDENTIFIERS
  layout_id: UUIDSchema,
  venue_id: UUIDSchema,
  
  // VERSIONING
  layout_version: SemverSchema,
  layout_hash: SHA256Schema,
  layout_status: LayoutStatusSchema,
  
  // METADATA
  created_at: z.date(),
  updated_at: z.date(),
  created_by: UUIDSchema,
  
  // STRUCTURE
  viewport: ViewportConfigSchema,
  sections: z.array(VenueSectionSchema).min(1, 'Layout must have at least one section'),
  
  // OPTIMIZATION
  cdn_url: z.string().url().optional(),
  file_size_kb: PositiveNumber,
  
  // COMPUTED FIELDS
  total_seats: PositiveNumber,
  accessibility_seats: z.number().int().min(0),
  premium_seats: z.number().int().min(0)
}).strict().refine(
  (data) => data.created_at <= data.updated_at,
  {
    message: 'updated_at must be after created_at',
    path: ['updated_at']
  }
).refine(
  (data) => {
    const computedTotalSeats = data.sections.reduce((sum, section) => sum + section.seats.length, 0);
    return data.total_seats === computedTotalSeats;
  },
  {
    message: 'total_seats must equal the sum of all seats in all sections',
    path: ['total_seats']
  }
);

// ================================================
// CDN EXPORT SCHEMAS
// ================================================

export const CDNSeatSchema = z.object({
  seat_id: UUIDSchema,
  row: z.string(),
  number: z.number().int().positive(),
  x: NormalizedCoordinate,
  y: NormalizedCoordinate,
  width: PositiveNumber.optional(),
  height: PositiveNumber.optional(),
  seat_type: SeatTypeSchema,
  accessibility_features: z.array(AccessibilityFeatureSchema).optional(),
  shape: SeatShapeSchema.optional()
}).strict();

export const CDNSectionSchema = z.object({
  section_id: UUIDSchema,
  section_name: z.string(),
  section_type: SectionTypeSchema,
  display_order: z.number().int().min(0),
  background_color: HexColorSchema,
  seats: z.array(CDNSeatSchema)
}).strict();

export const CDNLayoutExportSchema = z.object({
  layout_id: UUIDSchema,
  layout_version: SemverSchema,
  layout_hash: SHA256Schema,
  viewport: ViewportConfigSchema,
  sections: z.array(CDNSectionSchema),
  exported_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  cache_control: z.string().min(1)
}).strict();

// ================================================
// REQUEST/RESPONSE SCHEMAS
// ================================================

export const CreateVenueLayoutRequestSchema = z.object({
  // IDENTIFIERS (venue_id is required)
  venue_id: UUIDSchema,
  
  // VERSIONING
  layout_version: SemverSchema,
  layout_status: LayoutStatusSchema,
  
  // METADATA
  created_by: UUIDSchema,
  
  // STRUCTURE
  viewport: ViewportConfigSchema,
  sections: z.array(VenueSectionSchema).min(1, 'Layout must have at least one section'),
  
  // COMPUTED FIELDS
  total_seats: PositiveNumber,
  accessibility_seats: z.number().int().min(0),
  premium_seats: z.number().int().min(0)
}).strict();

export const UpdateVenueLayoutRequestSchema = CreateVenueLayoutRequestSchema.partial().extend({
  layout_version: SemverSchema // version is required for updates
});

export const VenueLayoutQuerySchema = z.object({
  venue_id: UUIDSchema.optional(),
  layout_status: LayoutStatusSchema.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sort_by: z.enum(['created_at', 'updated_at', 'layout_version']).default('updated_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc')
});

// ================================================
// VALIDATION HELPER FUNCTIONS
// ================================================

export function validateVenueLayout(data: unknown): z.SafeParseResult<VenueLayout> {
  return VenueLayoutSchema.safeParse(data);
}

export function validateCreateRequest(data: unknown) {
  return CreateVenueLayoutRequestSchema.safeParse(data);
}

export function validateUpdateRequest(data: unknown) {
  return UpdateVenueLayoutRequestSchema.safeParse(data);
}

export function validateCDNExport(data: unknown) {
  return CDNLayoutExportSchema.safeParse(data);
}

// ================================================
// BUSINESS RULE VALIDATORS
// ================================================

export function validateSeatUniqueness(layout: VenueLayout): string[] {
  const errors: string[] = [];
  const seatIds = new Set<string>();
  const seatLabels = new Set<string>();
  
  for (const section of layout.sections) {
    for (const seat of section.seats) {
      // Check UUID uniqueness
      if (seatIds.has(seat.seat_id)) {
        errors.push(`Duplicate seat_id: ${seat.seat_id}`);
      }
      seatIds.add(seat.seat_id);
      
      // Check label uniqueness within section
      const label = `${section.section_code}-${seat.row}${seat.number}`;
      if (seatLabels.has(label)) {
        errors.push(`Duplicate seat label: ${label}`);
      }
      seatLabels.add(label);
    }
  }
  
  return errors;
}

export function validateSeatCoordinates(layout: VenueLayout): string[] {
  const errors: string[] = [];
  const coordinates = new Set<string>();
  
  for (const section of layout.sections) {
    for (const seat of section.seats) {
      const coord = `${seat.x.toFixed(4)},${seat.y.toFixed(4)}`;
      if (coordinates.has(coord)) {
        errors.push(`Overlapping seats at coordinates (${seat.x}, ${seat.y})`);
      }
      coordinates.add(coord);
    }
  }
  
  return errors;
}

export function validateAccessibilityCompliance(layout: VenueLayout): string[] {
  const errors: string[] = [];
  const accessibleSeats = layout.sections
    .flatMap(s => s.seats)
    .filter(seat => seat.seat_type === 'accessible');
    
  const companionSeats = layout.sections
    .flatMap(s => s.seats)
    .filter(seat => seat.seat_type === 'companion');
    
  // ADA compliance: minimum 1% accessible seating
  const totalSeats = layout.total_seats;
  const minAccessibleSeats = Math.max(1, Math.ceil(totalSeats * 0.01));
  
  if (accessibleSeats.length < minAccessibleSeats) {
    errors.push(`Insufficient accessible seating: ${accessibleSeats.length}/${minAccessibleSeats} required`);
  }
  
  // Each accessible seat should have a companion seat option
  for (const accessibleSeat of accessibleSeats) {
    if (!accessibleSeat.companion_seat) {
      errors.push(`Accessible seat ${accessibleSeat.seat_id} missing companion seat`);
    }
  }
  
  return errors;
}