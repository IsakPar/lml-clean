/**
 * LML v1 Foundation - Redis Event Types
 * =====================================
 * Event interfaces for real-time seat updates
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

// ================================================
// CORE EVENT INTERFACES
// ================================================

export interface BaseSeatEvent {
  eventId: string;              // UUID for event tracking
  type: SeatEventType;
  showId: string;
  timestamp: string;            // ISO string
  version: string;              // Event schema version
}

export interface SeatLockEvent extends BaseSeatEvent {
  type: 'seat_locked' | 'seat_released' | 'lock_expired' | 'lock_extended';
  seatId: string;
  userId: string;
  lockId?: string;
  ttlSeconds?: number;
  expiresAt?: string;           // ISO string
}

export interface SeatReservationEvent extends BaseSeatEvent {
  type: 'seat_reserved' | 'reservation_cancelled' | 'reservation_confirmed';
  seatId: string;
  userId: string;
  reservationId?: string;
  bookingId?: string;
  priceInfo?: {
    amount: number;
    currency: string;
    category: string;
  };
}

export interface SeatBookingEvent extends BaseSeatEvent {
  type: 'seat_booked' | 'booking_cancelled' | 'booking_refunded';
  seatId: string;
  userId: string;
  bookingId: string;
  ticketId?: string;
  transactionId?: string;
}

export interface BulkSeatEvent extends BaseSeatEvent {
  type: 'bulk_lock' | 'bulk_release' | 'bulk_reservation';
  seatIds: string[];
  userId: string;
  successCount: number;
  failureCount: number;
  batchId: string;
}

export interface ShowEvent extends BaseSeatEvent {
  type: 'show_opened' | 'show_closed' | 'show_suspended' | 'seats_released';
  affectedSeats?: number;
  reason?: string;
}

export interface SystemEvent extends BaseSeatEvent {
  type: 'redis_reconnect' | 'cleanup_expired' | 'sync_postgres' | 'health_alert';
  component: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata?: Record<string, any>;
}

// Union type for all possible events
export type SeatEvent = 
  | SeatLockEvent 
  | SeatReservationEvent 
  | SeatBookingEvent 
  | BulkSeatEvent 
  | ShowEvent 
  | SystemEvent;

export type SeatEventType = 
  | 'seat_locked'
  | 'seat_released'
  | 'lock_expired'
  | 'lock_extended'
  | 'seat_reserved'
  | 'reservation_cancelled'
  | 'reservation_confirmed'
  | 'seat_booked'
  | 'booking_cancelled'
  | 'booking_refunded'
  | 'bulk_lock'
  | 'bulk_release'
  | 'bulk_reservation'
  | 'show_opened'
  | 'show_closed'
  | 'show_suspended'
  | 'seats_released'
  | 'redis_reconnect'
  | 'cleanup_expired'
  | 'sync_postgres'
  | 'health_alert';

// ================================================
// EVENT CHANNEL INTERFACES
// ================================================

export interface EventChannel {
  name: string;
  pattern: string;
  eventTypes: SeatEventType[];
  description: string;
}

export const EVENT_CHANNELS: Record<string, EventChannel> = {
  SEAT_EVENTS: {
    name: 'seat_events',
    pattern: 'seat_events:{showId}',
    eventTypes: [
      'seat_locked',
      'seat_released', 
      'lock_expired',
      'lock_extended',
      'seat_reserved',
      'reservation_cancelled',
      'reservation_confirmed',
      'seat_booked',
      'booking_cancelled',
      'booking_refunded'
    ],
    description: 'Individual seat state changes'
  },
  BULK_EVENTS: {
    name: 'bulk_events',
    pattern: 'bulk_events:{showId}',
    eventTypes: [
      'bulk_lock',
      'bulk_release',
      'bulk_reservation'
    ],
    description: 'Bulk seat operations'
  },
  SHOW_EVENTS: {
    name: 'show_events',
    pattern: 'show_events:{showId}',
    eventTypes: [
      'show_opened',
      'show_closed',
      'show_suspended',
      'seats_released'
    ],
    description: 'Show-level state changes'
  },
  SYSTEM_EVENTS: {
    name: 'system_events',
    pattern: 'system_events:global',
    eventTypes: [
      'redis_reconnect',
      'cleanup_expired',
      'sync_postgres',
      'health_alert'
    ],
    description: 'System and infrastructure events'
  }
} as const;

// ================================================
// EVENT VALIDATION
// ================================================

export interface EventValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSeatEvent(event: Partial<SeatEvent>): EventValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!event.eventId) errors.push('eventId is required');
  if (!event.type) errors.push('type is required');
  if (!event.showId) errors.push('showId is required');
  if (!event.timestamp) errors.push('timestamp is required');

  // UUID format validation (basic)
  if (event.eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.eventId)) {
    errors.push('eventId must be a valid UUID');
  }

  if (event.showId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.showId)) {
    errors.push('showId must be a valid UUID');
  }

  // Timestamp validation
  if (event.timestamp) {
    try {
      const date = new Date(event.timestamp);
      if (isNaN(date.getTime())) {
        errors.push('timestamp must be a valid ISO string');
      }
    } catch {
      errors.push('timestamp must be a valid ISO string');
    }
  }

  // Type-specific validations
  if (event.type) {
    const seatEvent = event as SeatEvent;
    
    switch (seatEvent.type) {
      case 'seat_locked':
      case 'seat_released':
      case 'lock_expired':
      case 'lock_extended':
        if (!(seatEvent as SeatLockEvent).seatId) errors.push('seatId is required for lock events');
        if (!(seatEvent as SeatLockEvent).userId) errors.push('userId is required for lock events');
        break;
        
      case 'seat_reserved':
      case 'reservation_cancelled':
      case 'reservation_confirmed':
        if (!(seatEvent as SeatReservationEvent).seatId) errors.push('seatId is required for reservation events');
        if (!(seatEvent as SeatReservationEvent).userId) errors.push('userId is required for reservation events');
        break;
        
      case 'seat_booked':
      case 'booking_cancelled':
      case 'booking_refunded':
        if (!(seatEvent as SeatBookingEvent).seatId) errors.push('seatId is required for booking events');
        if (!(seatEvent as SeatBookingEvent).userId) errors.push('userId is required for booking events');
        if (!(seatEvent as SeatBookingEvent).bookingId) errors.push('bookingId is required for booking events');
        break;
        
      case 'bulk_lock':
      case 'bulk_release':
      case 'bulk_reservation':
        if (!(seatEvent as BulkSeatEvent).seatIds?.length) errors.push('seatIds array is required for bulk events');
        if (!(seatEvent as BulkSeatEvent).userId) errors.push('userId is required for bulk events');
        if (!(seatEvent as BulkSeatEvent).batchId) errors.push('batchId is required for bulk events');
        break;
    }
  }

  // Performance warnings
  if (event.type?.startsWith('bulk_') && (event as BulkSeatEvent).seatIds?.length > 50) {
    warnings.push('Bulk events with >50 seats may impact performance');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ================================================
// EVENT FACTORY FUNCTIONS
// ================================================

export function createSeatLockEvent(
  showId: string,
  seatId: string,
  userId: string,
  type: 'seat_locked' | 'seat_released' | 'lock_expired' | 'lock_extended',
  options: {
    lockId?: string;
    ttlSeconds?: number;
    expiresAt?: Date;
  } = {}
): SeatLockEvent {
  return {
    eventId: crypto.randomUUID(),
    type,
    showId,
    seatId,
    userId,
    lockId: options.lockId,
    ttlSeconds: options.ttlSeconds,
    expiresAt: options.expiresAt?.toISOString(),
    timestamp: new Date().toISOString(),
    version: '1.0'
  };
}

export function createSystemEvent(
  type: 'redis_reconnect' | 'cleanup_expired' | 'sync_postgres' | 'health_alert',
  component: string,
  message: string,
  severity: 'info' | 'warning' | 'error' | 'critical' = 'info',
  metadata?: Record<string, any>
): SystemEvent {
  return {
    eventId: crypto.randomUUID(),
    type,
    showId: 'system', // Special showId for system events
    component,
    message,
    severity,
    metadata,
    timestamp: new Date().toISOString(),
    version: '1.0'
  };
}

// ================================================
// EVENT SERIALIZATION
// ================================================

export function serializeEvent(event: SeatEvent): string {
  return JSON.stringify(event);
}

export function deserializeEvent(data: string): SeatEvent | null {
  try {
    const parsed = JSON.parse(data);
    const validation = validateSeatEvent(parsed);
    
    if (!validation.isValid) {
      console.warn('Invalid event received:', validation.errors);
      return null;
    }
    
    return parsed as SeatEvent;
  } catch (error) {
    console.error('Failed to deserialize event:', error);
    return null;
  }
}