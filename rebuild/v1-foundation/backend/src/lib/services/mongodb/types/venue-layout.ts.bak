/**
 * LML v1 Foundation - MongoDB Venue Layout Types
 * =============================================
 * Core TypeScript interfaces for venue layouts with access control and deployment support
 */

export interface MultilingualLabel {
  en: string;                    // Required English
  sv?: string;                   // Optional Swedish  
  fr?: string;                   // Optional French
  [languageCode: string]?: string; // Extensible for future languages
}

export interface Coordinate {
  x: number;  // Normalized coordinate (0-1)
  y: number;  // Normalized coordinate (0-1)
}

export interface VenueSeat {
  seatId: string;               // SHA-256 hash: sha256(`${layoutId}_${section}_${row}_${number}`)
  section: string;              // Section identifier
  row: string;                  // Row identifier (A, B, C, etc.)
  number: number;               // Seat number within row
  x: number;                    // Normalized X coordinate (0-1)
  y: number;                    // Normalized Y coordinate (0-1)
  color?: string;               // Seat color (hex or predefined)
  category: 'premium' | 'standard' | 'economy' | 'accessible'; // Seat category
  labels?: MultilingualLabel;   // Display labels for seat
  facing?: 'stage' | 'center' | 'forward'; // Seat orientation
  disabled?: boolean;           // Seat not available for booking
}

export interface VenueSection {
  sectionId: string;            // UUID primary identifier
  name: string;                 // Section name
  labels?: MultilingualLabel;   // Display labels for section
  color?: string;               // Section color (hex)
  category?: string;            // Section category
  capacity: number;             // Total seats in section
  level?: number;               // Floor/tier level
  bounds?: {                    // Section boundaries for rendering optimization
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface VenueZone {
  zoneId: string;               // Zone identifier
  type: 'stage' | 'orchestra_pit' | 'aisle' | 'lobby' | 'emergency_exit'; // Zone type
  name: string;                 // Zone name
  coordinates: number[][];      // Polygon coordinates [[x,y], [x,y], ...]
  metadata?: {                  // Optional zone metadata
    accessible?: boolean;
    capacity?: number;
  };
}

export interface Viewport {
  width: number;                // Canvas width
  height: number;               // Canvas height  
  unit: 'relative' | 'px';      // Unit type for rendering
  scale?: number;               // Optional scale factor
}

export interface AccessControl {
  createdBy: string;            // User ID/email who created
  editors: string[];            // Who can edit (before publish)
  publishedBy?: string;         // Who made it live (audit trail)
  organizationId: string;       // Multi-tenant support
}

export interface DeploymentMetadata {
  environment: 'draft' | 'staging' | 'production';
  deployedAt?: Date;
  deployedBy?: string;
  cdnUrls?: {
    staging?: string;           // Staging CDN URL
    production?: string;        // Production CDN URL
  };
  rollbackTarget?: string;      // Previous version for rollback
}

export interface VenueLayout {
  _id?: string;                 // MongoDB ObjectId
  layoutId: string;             // Unique layout identifier
  venueId: string;              // Venue identifier
  name: string;                 // Human-readable layout name
  version: string;              // Semantic version (v1.2.3)
  layoutHash: string;           // SHA256 hash for change detection
  
  // ✅ NEW: Layout classification
  layoutType: 'seated' | 'standing' | 'hybrid'; // Layout type for rendering/pricing
  
  // Status and lifecycle (updated to match approved schema)
  status: 'draft' | 'published' | 'deployed'; // Current lifecycle status
  publishedAt?: Date;           // When was it published?
  deployedAt?: Date;            // When was it deployed to CDN?
  deleted?: boolean;            // Soft deletion flag
  deletedAt?: Date;             // When was it deleted?
  
  // Layout data
  viewport?: Viewport;          // Optional canvas configuration
  seats: VenueSeat[];           // All seats in venue
  sections?: VenueSection[];    // All sections in venue (optional for flexibility)
  zones?: VenueZone[];          // Stage, aisles, etc.
  
  // Access control and deployment (optional for basic layouts)
  access?: AccessControl;       // Who can access/modify
  deployment?: DeploymentMetadata; // Deployment status
  
  // Audit trail
  createdAt: Date;              // Creation timestamp
  updatedAt: Date;              // Last update timestamp
  
  // Layout metadata
  description?: string;         // Optional description
  tags?: string[];              // Optional tags for organization
  
  // Validation metadata
  isValid?: boolean;            // Has passed validation
  validationErrors?: string[];  // Any validation issues
}

export interface LayoutVersion {
  version: string;              // Semantic version
  hash: string;                 // Content hash
  createdAt: Date;              // Version creation time
  createdBy: string;            // Who created this version
  changes?: string[];           // Summary of changes
}

export interface LayoutChangeLog {
  layoutId: string;             // Layout being changed
  fromVersion?: string;         // Previous version (null for creation)
  toVersion: string;            // New version
  changeType: 'create' | 'update' | 'publish' | 'delete' | 'restore';
  changedBy: string;            // User making the change
  changedAt: Date;              // When the change occurred
  changes: {
    seatsAdded?: number;        // Number of seats added
    seatsRemoved?: number;      // Number of seats removed
    seatsMoved?: number;        // Number of seats repositioned
    sectionsAdded?: number;     // Number of sections added
    sectionsRemoved?: number;   // Number of sections removed
    sectionsRenamed?: number;   // Number of sections renamed
  };
  description?: string;         // Optional change description
}