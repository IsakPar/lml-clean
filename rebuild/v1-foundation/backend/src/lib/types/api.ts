/**
 * LML v1 Foundation - API Types & Response Schemas
 * ===============================================
 * Type definitions for all API responses
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

// ================================================
// COMMON API RESPONSE TYPES
// ================================================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: APIMetadata;
}

export interface APIError {
  code: string;
  message: string;
  details?: string;
  timestamp: string;
}

export interface APIMetadata {
  timestamp: string;
  version: string;
  requestId?: string;
  response_time_ms?: number;
}

// ================================================
// HEALTH ENDPOINT TYPES
// ================================================

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  services: {
    postgres: ServiceHealth;
    mongodb: ServiceHealth;
    redis: ServiceHealth;
    redis_service?: ServiceHealthDetailed; // Added for Redis service health
  };
}

export interface ServiceHealth {
  status: 'connected' | 'disconnected' | 'error';
  responseTime?: number;
  error?: string;
}

export interface ServiceHealthDetailed extends ServiceHealth {
  memoryUsage?: string;
  connectedClients?: number;
}

// ================================================
// SHOWS ENDPOINT TYPES
// ================================================

export interface ShowsResponse {
  shows: Show[];
  total: number;
  page?: number;
  limit?: number;
}

export interface Show {
  id: number;
  slug: string;
  title: string;
  description?: string;
  venue: {
    name: string;
    address?: string;
  };
  datetime: {
    date: string;        // YYYY-MM-DD
    time: string;        // HH:MM
    duration: number;    // minutes
  };
  pricing: {
    minPricePence: number;
    maxPricePence: number;
    currency: 'GBP';
  };
  availability: {
    totalCapacity: number;
    availableSeats: number;
    soldOut: boolean;
  };
  status: 'active' | 'sold_out' | 'cancelled' | 'draft';
  category: string;
  ageRating: string;
  language: string;
  seatmap: {
    venueId: string;
    showSlug: string;
  };
}

// ================================================
// SEATMAP ENDPOINT TYPES
// ================================================

export interface SeatMapResponse {
  showId: number;
  venueId: string;
  showSlug: string;
  seatMap: SeatMapData;
  metadata: SeatMapMetadata;
}

export interface SeatMapData {
  sections: Record<string, SeatSection>;
  layout: VenueLayout;
  metadata: {
    totalSeats: number;
    availableSeats: number;
    priceRange: {
      min: number;  // pence
      max: number;  // pence
    };
    accessibleSeats: number;
    levels: string[];
  };
}

export interface SeatSection {
  id: string;
  displayName: string;
  color: string;
  priceCategory?: string;
  seats: Seat[];
  visualConfig: {
    startX: number;
    startY: number;
    rows: number;
    seatsPerRow: number;
    seatSpacing: number;
    rowSpacing: number;
  };
}

export interface Seat {
  // MongoDB seat layout data
  hardcodedId: string;     // "stalls-A-1"
  layoutId: string;        // MongoDB _id
  row: string;            // "A", "B", "1", "2"
  number: number;         // 1, 2, 3, etc.
  x: number;              // Canvas X coordinate
  y: number;              // Canvas Y coordinate
  isAccessible: boolean;
  
  // PostgreSQL pricing/availability data
  seatType: string;       // "premium", "standard", "balcony"
  pricePence: number;     // Current price in pence
  isAvailable: boolean;   // From PostgreSQL availability
  isReserved: boolean;    // 15-min hold in Redis
  
  // Visual rendering data
  color: string;          // Section color
  level: number;          // Floor level (0=ground, 1=balcony)
  viewQuality: 'excellent' | 'good' | 'fair' | 'limited';
}

export interface VenueLayout {
  width: number;
  height: number;
  scale: number;
  levels: number;
  centerX: number;
  centerY: number;
  stage?: StageElement;
  aisles?: AisleElement[];
  labels?: LabelElement[];
  accessibilitySpots?: AccessibilityElement[];
}

export interface StageElement {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  backgroundColor?: string;
  borderColor?: string;
}

export interface AisleElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
}

export interface LabelElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  fontWeight?: string;
}

export interface AccessibilityElement {
  id: string;
  type: 'wheelchair' | 'assisted_listening' | 'visual_aid';
  x: number;
  y: number;
  description?: string;
}

export interface SeatMapMetadata {
  totalSeats: number;
  availableSeats: number;
  priceRange: {
    min: number;
    max: number;
  };
  accessibleSeats: number;
  levels: string[];
  dataSource: 'hybrid' | 'mongodb' | 'cache';
  generatedAt: string;    // ISO timestamp
  cacheExpiry?: string;   // ISO timestamp
}

// ================================================
// ERROR TYPES
// ================================================

export const API_ERROR_CODES = {
  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_ID: 'INVALID_ID',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  
  // Resource errors
  SHOW_NOT_FOUND: 'SHOW_NOT_FOUND',
  SEATMAP_NOT_FOUND: 'SEATMAP_NOT_FOUND',
  VENUE_NOT_FOUND: 'VENUE_NOT_FOUND',
  
  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  MONGODB_ERROR: 'MONGODB_ERROR',
  REDIS_ERROR: 'REDIS_ERROR',
  
  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT'
} as const;

export type APIErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES];