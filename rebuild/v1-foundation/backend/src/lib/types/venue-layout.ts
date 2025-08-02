/**
 * LML v1 Foundation - Venue Layout Types
 * =====================================
 * Production-grade venue layout data models
 * Created: 2025-08-02
 * Status: Phase 2 - Enterprise Schema Design
 */

// ================================================
// CORE VENUE LAYOUT INTERFACES
// ================================================

export interface VenueLayout {
  // PRIMARY IDENTIFIERS (UUIDs)
  layout_id: string;           // UUID - primary identifier
  venue_id: string;            // UUID - links to venue in PostgreSQL
  
  // VERSIONING & LIFECYCLE MANAGEMENT
  layout_version: string;       // semver: "1.2.3"
  layout_hash: string;          // SHA-256 of layout content for cache invalidation
  layout_status: LayoutStatus;
  
  // METADATA & AUDIT TRAIL
  created_at: Date;
  updated_at: Date;
  created_by: string;           // admin user UUID
  
  // VIEWPORT DEFINITION (iOS Canvas Optimization)
  viewport: ViewportConfig;
  
  // VENUE STRUCTURE
  sections: VenueSection[];
  
  // CDN & PERFORMANCE OPTIMIZATION
  cdn_url?: string;             // static JSON URL when deployed to CDN
  file_size_kb: number;         // for performance monitoring
  
  // METADATA FOR ADMIN/ANALYTICS
  total_seats: number;          // computed field
  accessibility_seats: number;  // computed field
  premium_seats: number;        // computed field
}

export interface VenueSection {
  // IDENTIFIERS
  section_id: string;           // UUID
  section_name: string;         // "Stalls", "Circle", "Royal Box", "Standing"
  section_code: string;         // "ST", "CR", "RB" - short identifier
  section_type: SectionType;
  
  // DISPLAY & RENDERING
  display_order: number;        // z-index for rendering layers
  background_color?: string;    // hex color for section highlighting
  border_color?: string;        // hex color for section borders
  
  // PRICING INTEGRATION (links to PostgreSQL)
  pricing_category: string;     // links to pricing rules in Postgres
  
  // SEAT COLLECTION
  seats: VenueSeat[];
  
  // SECTION METADATA
  total_capacity: number;       // computed from seats array
  accessibility_info?: AccessibilityInfo;
}

export interface VenueSeat {
  // PRIMARY IDENTIFIER
  seat_id: string;              // UUID - primary identifier for all systems
  
  // HUMAN-READABLE LABELS (metadata only, never used for logic)
  row: string;                  // "A", "B", "AA", "1", "2"
  number: number;               // 1, 2, 3, etc.
  
  // COORDINATE SYSTEM (normalized 0-1 for viewport scaling)
  x: number;                    // 0.0 to 1.0 (left to right)
  y: number;                    // 0.0 to 1.0 (top to bottom)
  width?: number;               // seat width in viewport units
  height?: number;              // seat height in viewport units
  rotation?: number;            // degrees rotation for angled seats
  
  // SEAT CLASSIFICATION
  seat_type: SeatType;
  accessibility_features?: AccessibilityFeature[];
  
  // SEAT RELATIONSHIPS (for linked/companion seats)
  adjacent_seats?: string[];    // array of seat_ids for linked bookings
  companion_seat?: string;      // seat_id for wheelchair companion seat
  
  // VISUAL PROPERTIES
  shape?: SeatShape;            // default: 'rectangle'
  color_override?: string;      // custom color (hex) for special seats
}

export interface ViewportConfig {
  width: number;                // logical viewport width
  height: number;               // logical viewport height
  scale_factor: number;         // default zoom level (1.0 = 100%)
  min_scale: number;            // minimum zoom (0.1 = 10%)
  max_scale: number;            // maximum zoom (5.0 = 500%)
  
  // COORDINATE SYSTEM METADATA
  coordinate_system: 'normalized'; // always normalized 0-1
  origin: 'top-left';           // coordinate origin point
}

export interface AccessibilityInfo {
  wheelchair_accessible: boolean;
  hearing_loop: boolean;
  sight_impaired_support: boolean;
  companion_seats_available: boolean;
  accessible_routes: string[];  // descriptions of access routes
}

// ================================================
// ENUMS FOR TYPE SAFETY
// ================================================

export type LayoutStatus = 
  | 'draft'       // being created/edited
  | 'active'      // live and accepting bookings
  | 'deprecated'; // old version, no new bookings

export type SectionType = 
  | 'general'     // standard seating
  | 'premium'     // upgraded seating
  | 'accessible'  // wheelchair/accessibility section
  | 'standing'    // standing room only
  | 'box'         // private boxes
  | 'balcony';    // balcony seating

export type SeatType = 
  | 'standard'    // regular seat
  | 'accessible'  // wheelchair space
  | 'premium'     // upgraded seat
  | 'companion'   // companion to accessible seat
  | 'aisle'       // aisle seat (extra legroom)
  | 'restricted'; // restricted view

export type SeatShape = 
  | 'rectangle'   // standard rectangular seat
  | 'circle'      // round seat/table
  | 'oval'        // oval seat
  | 'custom';     // custom shape (use SVG path)

export type AccessibilityFeature = 
  | 'wheelchair_space'     // wheelchair accessible space
  | 'companion_seat'       // companion seat for wheelchair user
  | 'hearing_loop'         // hearing loop available
  | 'sight_line_clear'     // clear sight line for visually impaired
  | 'easy_access'          // easy access (minimal steps)
  | 'transfer_seat';       // easy transfer from wheelchair

// ================================================
// API RESPONSE TYPES
// ================================================

export interface VenueLayoutResponse {
  layout: VenueLayout;
  metadata: {
    last_modified: string;
    cdn_version?: string;
    performance_metrics?: {
      file_size_kb: number;
      generation_time_ms: number;
    };
  };
}

export interface VenueLayoutListResponse {
  layouts: VenueLayoutSummary[];
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface VenueLayoutSummary {
  layout_id: string;
  venue_id: string;
  layout_version: string;
  layout_status: LayoutStatus;
  created_at: Date;
  total_seats: number;
  file_size_kb: number;
}

// ================================================
// CDN EXPORT FORMAT
// ================================================

export interface CDNLayoutExport {
  // MINIMAL DATA FOR CDN DELIVERY
  layout_id: string;
  layout_version: string;
  layout_hash: string;
  viewport: ViewportConfig;
  sections: CDNSection[];
  
  // CDN METADATA
  exported_at: string;
  expires_at?: string;
  cache_control: string;
}

export interface CDNSection {
  section_id: string;
  section_name: string;
  section_type: SectionType;
  display_order: number;
  background_color?: string;
  seats: CDNSeat[];
}

export interface CDNSeat {
  seat_id: string;
  row: string;
  number: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  seat_type: SeatType;
  accessibility_features?: AccessibilityFeature[];
  shape?: SeatShape;
}

// ================================================
// VALIDATION & UTILITY TYPES
// ================================================

export interface LayoutValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  performance_score: number; // 0-100
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  seat_id?: string;
  section_id?: string;
}

export interface ValidationWarning extends ValidationError {
  suggestion?: string;
}

// ================================================
// MIGRATION & ANALYSIS TYPES
// ================================================

export interface LegacyMigrationMapping {
  legacy_id: string;
  new_layout_id: string;
  migration_notes: string[];
  data_quality_score: number;
}