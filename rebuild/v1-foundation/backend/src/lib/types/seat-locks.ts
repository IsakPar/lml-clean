/**
 * LML v1 Foundation - Seat Lock Types
 * ====================================
 * TypeScript types for seat locking and reservation system
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Seat Locking
 */

// ================================================
// SEAT LOCK TYPES
// ================================================

export interface SeatLock {
  lock_id: string;           // Unique lock identifier: userId:timestamp
  seat_id: string;           // UUID of the seat
  show_id: string;           // UUID of the show
  user_id: string;           // UUID of the user who locked the seat
  locked_at: Date;           // When the lock was created
  expires_at: Date;          // When the lock expires
  ttl_seconds: number;       // Time to live in seconds
}

export interface SeatLockStatus {
  seat_id: string;
  is_locked: boolean;
  lock_id?: string;
  user_id?: string;
  ttl_seconds?: number;
  expires_at?: Date;
}

export interface SeatLockRequest {
  seat_ids: string[];        // Array of seat UUIDs to lock
  user_id: string;           // UUID of the user requesting locks
  show_id: string;           // UUID of the show
  ttl_seconds?: number;      // Optional TTL override (default: 900s = 15min)
}

export interface SeatLockResponse {
  success: boolean;
  locked_seats: SeatLock[];
  failed_seats: Array<{
    seat_id: string;
    error: string;
    reason: 'already_locked' | 'invalid_seat' | 'show_not_found' | 'system_error';
  }>;
  lock_expiry: Date;         // When all locks will expire
}

export interface SeatReleaseRequest {
  seat_ids: string[];        // Array of seat UUIDs to release
  user_id: string;           // UUID of the user releasing locks
  show_id: string;           // UUID of the show
  lock_ids?: string[];       // Optional: specific lock IDs to verify ownership
}

export interface SeatReleaseResponse {
  success: boolean;
  released_seats: string[];  // Array of successfully released seat IDs
  failed_seats: Array<{
    seat_id: string;
    error: string;
    reason: 'not_locked' | 'not_owned' | 'system_error';
  }>;
}

// ================================================
// SEAT STATE TYPES (for FSM)
// ================================================

export type SeatState = 
  | 'available'     // Available for booking
  | 'locked'        // Temporarily locked by a user (Redis)
  | 'reserved'      // Reserved and payment pending (PostgreSQL)
  | 'held'          // Payment processing (PostgreSQL)
  | 'booked'        // Successfully booked (PostgreSQL)
  | 'cancelled';    // Booking cancelled (PostgreSQL)

export interface SeatStateTransition {
  from_state: SeatState;
  to_state: SeatState;
  allowed: boolean;
  requires_auth: boolean;
  audit_required: boolean;
}

// Valid state transitions matrix
export const SEAT_STATE_TRANSITIONS: SeatStateTransition[] = [
  { from_state: 'available', to_state: 'locked', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'locked', to_state: 'available', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'locked', to_state: 'reserved', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'reserved', to_state: 'held', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'reserved', to_state: 'available', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'held', to_state: 'booked', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'held', to_state: 'available', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'booked', to_state: 'cancelled', allowed: true, requires_auth: true, audit_required: true },
  { from_state: 'cancelled', to_state: 'available', allowed: true, requires_auth: false, audit_required: true },
];

// ================================================
// REAL-TIME EVENT TYPES
// ================================================

export interface SeatEvent {
  event_id: string;          // UUID for event tracking
  type: SeatEventType;
  show_id: string;
  seat_id: string;
  user_id: string;
  timestamp: string;         // ISO string
  data?: Record<string, any>; // Additional event data
}

export type SeatEventType = 
  | 'seat_locked'           // Seat locked by user
  | 'seat_released'         // Seat lock released
  | 'seat_reserved'         // Seat reserved (payment pending)
  | 'seat_booked'           // Seat successfully booked
  | 'seat_cancelled'        // Booking cancelled
  | 'lock_expired'          // Lock expired automatically
  | 'lock_extended';        // Lock TTL extended

// ================================================
// BULK OPERATIONS
// ================================================

export interface BulkSeatOperation {
  operation_id: string;      // UUID for tracking bulk operation
  show_id: string;
  user_id: string;
  seat_ids: string[];
  operation_type: 'lock' | 'release' | 'reserve' | 'cancel';
  requested_at: Date;
}

export interface BulkSeatResult {
  operation_id: string;
  success_count: number;
  failure_count: number;
  total_count: number;
  processing_time_ms: number;
  results: Array<{
    seat_id: string;
    success: boolean;
    error?: string;
  }>;
}

// ================================================
// MONITORING & ANALYTICS
// ================================================

export interface SeatLockMetrics {
  show_id: string;
  total_seats: number;
  locked_seats: number;
  locked_percentage: number;
  average_lock_duration_seconds: number;
  lock_churn_rate: number;   // locks per minute
  active_users: number;      // users with active locks
  peak_concurrent_locks: number;
  collected_at: Date;
}

export interface RedisHealthMetrics {
  status: 'healthy' | 'degraded' | 'error';
  response_time_ms: number;
  memory_usage_mb: number;
  connected_clients: number;
  operations_per_second: number;
  error_rate_percentage: number;
  uptime_seconds: number;
}

// ================================================
// CONFIGURATION TYPES
// ================================================

export interface SeatLockConfig {
  default_ttl_seconds: number;        // Default lock duration
  max_ttl_seconds: number;            // Maximum allowed lock duration
  cleanup_interval_seconds: number;   // How often to run cleanup
  max_locks_per_user: number;         // Maximum seats one user can lock
  lock_extension_seconds: number;     // How much to extend expiring locks
  redis_key_prefix: string;           // Prefix for Redis keys
}

// Default configuration
export const DEFAULT_SEAT_LOCK_CONFIG: SeatLockConfig = {
  default_ttl_seconds: 900,      // 15 minutes
  max_ttl_seconds: 1800,         // 30 minutes max
  cleanup_interval_seconds: 60,  // Clean up every minute
  max_locks_per_user: 10,        // Max 10 seats per user
  lock_extension_seconds: 300,   // 5 minute extension
  redis_key_prefix: 'seat_lock'
};

// ================================================
// ERROR TYPES
// ================================================

export interface SeatLockError {
  code: string;
  message: string;
  seat_id?: string;
  user_id?: string;
  show_id?: string;
  timestamp: Date;
}

export const SEAT_LOCK_ERROR_CODES = {
  SEAT_ALREADY_LOCKED: 'SEAT_ALREADY_LOCKED',
  SEAT_NOT_FOUND: 'SEAT_NOT_FOUND',
  SHOW_NOT_FOUND: 'SHOW_NOT_FOUND',
  USER_MAX_LOCKS_EXCEEDED: 'USER_MAX_LOCKS_EXCEEDED',
  INVALID_LOCK_OWNERSHIP: 'INVALID_LOCK_OWNERSHIP',
  LOCK_EXPIRED: 'LOCK_EXPIRED',
  REDIS_CONNECTION_ERROR: 'REDIS_CONNECTION_ERROR',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
} as const;