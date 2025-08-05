/**
 * LML v1 Foundation - VenueLayout Schema Definitions
 * ==================================================
 * Type definitions and Zod schemas for layout service
 * Created: 2025-08-05
 * Status: Phase 1 - Core Architecture
 */

import { z } from 'zod';

// ================================================
// CORE LAYOUT TYPES
// ================================================

export interface VenueLayout {
  _id?: string;
  layoutId: string;
  venueId: string;
  organizationId: string;
  name: string;
  version: string;
  layoutHash: string;
  
  // Layout classification
  layoutType: 'seated' | 'standing' | 'hybrid';
  
  // Lifecycle status
  status: 'draft' | 'published' | 'deployed' | 'archived';
  publishedAt?: Date;
  deployedAt?: Date;
  archivedAt?: Date;
  
  // Layout data
  viewport?: {
    width: number;
    height: number;
    scale: number;
  };
  seats: VenueSeat[];
  sections?: VenueSection[];
  zones?: VenueZone[];
  
  // Metadata
  description?: string;
  tags?: string[];
  
  // Audit trail
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  
  // Validation
  isValid: boolean;
  validationErrors?: string[];
  
  // Versioning (Fix #8: Layout Versioning)
  parentVersionId?: string;
  isActiveVersion: boolean;
  versionNotes?: string;
}

export interface VenueSeat {
  seatId: string;
  sectionId: string;
  row: string;
  number: string;
  x: number;
  y: number;
  isAccessible?: boolean;
  status: 'available' | 'reserved' | 'blocked';
  priceCategory?: string;
}

export interface VenueSection {
  sectionId: string;
  name: string;
  color: string;
  capacity: number;
  priceCategory: string;
}

export interface VenueZone {
  zoneId: string;
  type: 'stage' | 'aisle' | 'entrance' | 'emergency_exit' | 'bar' | 'restroom';
  name: string;
  coordinates: Array<{ x: number; y: number }>;
}

// ================================================
// LAYOUT VERSIONING (Fix #8)
// ================================================

export interface LayoutVersion {
  versionId: string;
  layoutId: string;
  version: string;
  layoutHash: string;
  publishedAt: Date;
  publishedBy: string;
  isActive: boolean;
  rollbackAvailable: boolean;
  changes?: string[];
  cdnDeploymentId?: string;
}

// ================================================
// SERVICE OPERATION TYPES
// ================================================

export interface CreateLayoutRequest {
  venueId: string;
  organizationId: string;
  name: string;
  layoutType: 'seated' | 'standing' | 'hybrid';
  seats: VenueSeat[];
  sections?: VenueSection[];
  zones?: VenueZone[];
  viewport?: { width: number; height: number; scale: number };
  description?: string;
  tags?: string[];
  createdBy: string;
}

export interface UpdateLayoutRequest {
  layoutId: string;
  name?: string;
  seats?: VenueSeat[];
  sections?: VenueSection[];
  zones?: VenueZone[];
  viewport?: { width: number; height: number; scale: number };
  description?: string;
  tags?: string[];
  updatedBy: string;
}

export interface PublishLayoutRequest {
  layoutId: string;
  version: string;
  publishedBy: string;
  versionNotes?: string;
  forcePurgeCache?: boolean;
}

export interface ServiceOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
  operationId: string;
  timestamp: Date;
}

// ================================================
// ZOD VALIDATION SCHEMAS
// ================================================

export const VenueLayoutSchema = z.object({
  layoutId: z.string().min(1),
  venueId: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // Semantic versioning
  layoutType: z.enum(['seated', 'standing', 'hybrid']),
  status: z.enum(['draft', 'published', 'deployed', 'archived']),
  seats: z.array(z.object({
    seatId: z.string(),
    sectionId: z.string(),
    row: z.string(),
    number: z.string(),
    x: z.number(),
    y: z.number(),
    status: z.enum(['available', 'reserved', 'blocked']),
  })),
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    scale: z.number().positive(),
  }).optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const CreateLayoutRequestSchema = z.object({
  venueId: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(100),
  layoutType: z.enum(['seated', 'standing', 'hybrid']),
  seats: z.array(z.object({
    seatId: z.string(),
    sectionId: z.string(),
    row: z.string(),
    number: z.string(),
    x: z.number(),
    y: z.number(),
  })).min(1),
  createdBy: z.string().min(1),
});

export const UpdateLayoutRequestSchema = z.object({
  layoutId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  seats: z.array(z.object({
    seatId: z.string(),
    sectionId: z.string(),
    row: z.string(),
    number: z.string(),
    x: z.number(),
    y: z.number(),
  })).optional(),
  updatedBy: z.string().min(1),
});

export const PublishLayoutRequestSchema = z.object({
  layoutId: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  publishedBy: z.string().min(1),
  versionNotes: z.string().optional(),
  forcePurgeCache: z.boolean().optional(),
});

// ================================================
// CACHE KEY UTILITIES
// ================================================

export class LayoutCacheKeys {
  private static prefix = 'venue-layout:';
  
  static layout(venueId: string): string {
    return `${this.prefix}layout:${venueId}`;
  }
  
  static layoutVersion(layoutId: string, version: string): string {
    return `${this.prefix}version:${layoutId}:${version}`;
  }
  
  static permissions(userId: string, venueId: string): string {
    return `${this.prefix}permissions:${userId}:${venueId}`;
  }
  
  static metadata(venueId: string): string {
    return `${this.prefix}metadata:${venueId}`;
  }
}

// ================================================
// ERROR TYPES
// ================================================

export class LayoutServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'LayoutServiceError';
  }
}

export class LayoutValidationError extends LayoutServiceError {
  constructor(message: string, public validationErrors: string[]) {
    super(message, 'VALIDATION_ERROR', { validationErrors });
  }
}

export class LayoutNotFoundError extends LayoutServiceError {
  constructor(layoutId: string) {
    super(`Layout not found: ${layoutId}`, 'LAYOUT_NOT_FOUND', { layoutId });
  }
}