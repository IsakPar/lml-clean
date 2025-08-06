/**
 * LML v1 Foundation - FSM-Lock Integration
 * =======================================
 * Atomic integration between Redis locks and booking FSM transitions
 * "The Golden Path" - Ensures locks and state move together
 * Created: 2025-08-05
 * Status: Phase 2B - Production FSM Integration
 */

import { 
  acquireSeatLock, 
  releaseSeatLock, 
  extendSeatLockTTL, 
  isLockHeldByUser,
  getSeatLockStatus,
  SeatLockRequest,
  SeatLockResult 
} from './seat-lock';
import { 
  recordSeatReservationSuccess, 
  recordSeatReservationFailure,
  recordLockToPaymentDuration,
  recordLockConflict 
} from './lock-metrics';
import { invalidateLayoutCache } from '../cache/layout-cache';

// ================================================
// FSM STATE DEFINITIONS
// ================================================

export type BookingState = 
  | 'available'     // Seat is open for booking
  | 'selecting'     // User is viewing/considering seat
  | 'locked'        // Seat is temporarily held (Redis lock)
  | 'reserved'      // Seat is reserved (payment pending)
  | 'paid'          // Seat is paid for (booking complete)
  | 'released'      // Seat was held but released/expired
  | 'blocked';      // Seat is administratively blocked

export type BookingAction =
  | 'select'        // User clicks on seat
  | 'hold'          // User confirms selection (acquires lock)
  | 'reserve'       // User proceeds to payment
  | 'pay'           // Payment successful
  | 'release'       // User abandons or admin releases
  | 'timeout'       // Lock TTL expires
  | 'block'         // Admin blocks seat
  | 'unblock';      // Admin unblocks seat

export interface BookingTransition {
  fromState: BookingState;
  action: BookingAction;
  toState: BookingState;
  requiresLock: boolean;
  requiresPayment: boolean;
  lockTTLMs?: number;
}

// ================================================
// FSM TRANSITION TABLE
// ================================================

const FSM_TRANSITIONS: BookingTransition[] = [
  // User flow: available → selecting → locked → reserved → paid
  { fromState: 'available', action: 'select', toState: 'selecting', requiresLock: false, requiresPayment: false },
  { fromState: 'selecting', action: 'hold', toState: 'locked', requiresLock: true, requiresPayment: false, lockTTLMs: 180000 }, // 3 min
  { fromState: 'locked', action: 'reserve', toState: 'reserved', requiresLock: true, requiresPayment: false, lockTTLMs: 900000 }, // 15 min for payment
  { fromState: 'reserved', action: 'pay', toState: 'paid', requiresLock: true, requiresPayment: true },
  
  // Release flows
  { fromState: 'selecting', action: 'release', toState: 'available', requiresLock: false, requiresPayment: false },
  { fromState: 'locked', action: 'release', toState: 'available', requiresLock: true, requiresPayment: false },
  { fromState: 'reserved', action: 'release', toState: 'available', requiresLock: true, requiresPayment: false },
  
  // Timeout flows
  { fromState: 'locked', action: 'timeout', toState: 'released', requiresLock: false, requiresPayment: false },
  { fromState: 'reserved', action: 'timeout', toState: 'released', requiresLock: false, requiresPayment: false },
  { fromState: 'released', action: 'release', toState: 'available', requiresLock: false, requiresPayment: false },
  
  // Admin flows
  { fromState: 'available', action: 'block', toState: 'blocked', requiresLock: false, requiresPayment: false },
  { fromState: 'blocked', action: 'unblock', toState: 'available', requiresLock: false, requiresPayment: false },
];

// ================================================
// FSM CONTEXT & REQUEST TYPES
// ================================================

export interface BookingContext {
  seatId: string;
  userId: string;
  sessionId: string;
  showId: string;
  venueId: string;
  currentState: BookingState;
  lockAcquiredAt?: Date;
  reservedAt?: Date;
  paymentIntentId?: string;
}

export interface FSMTransitionRequest {
  context: BookingContext;
  action: BookingAction;
  metadata?: {
    paymentIntentId?: string;
    adminUserId?: string;
    force?: boolean;
  };
}

export interface FSMTransitionResult {
  success: boolean;
  newState?: BookingState;
  newContext?: BookingContext;
  lockResult?: SeatLockResult;
  error?: string;
  conflictDetails?: {
    currentOwner?: string;
    currentState?: BookingState;
    retryAfterMs?: number;
  };
}

// ================================================
// FSM VALIDATION & TRANSITION LOGIC
// ================================================

/**
 * Get valid transition for current state and action
 */
function getValidTransition(fromState: BookingState, action: BookingAction): BookingTransition | null {
  return FSM_TRANSITIONS.find(t => t.fromState === fromState && t.action === action) || null;
}

/**
 * Validate if transition is allowed
 */
export function isTransitionAllowed(fromState: BookingState, action: BookingAction): boolean {
  return getValidTransition(fromState, action) !== null;
}

/**
 * Get all possible actions from current state
 */
export function getPossibleActions(currentState: BookingState): BookingAction[] {
  return FSM_TRANSITIONS
    .filter(t => t.fromState === currentState)
    .map(t => t.action);
}

// ================================================
// ATOMIC FSM TRANSITIONS WITH LOCKING
// ================================================

/**
 * Execute atomic FSM transition with lock coordination
 * This is the core of the booking system - lock and state must move together
 */
export async function executeBookingTransition(request: FSMTransitionRequest): Promise<FSMTransitionResult> {
  const { context, action, metadata } = request;
  const transition = getValidTransition(context.currentState, action);
  
  if (!transition) {
    return {
      success: false,
      error: `Invalid transition: ${context.currentState} → ${action}`,
    };
  }
  
  const startTime = Date.now();
  let lockResult: SeatLockResult | undefined;
  
  try {
    // Step 1: Handle lock operations based on transition requirements
    if (transition.requiresLock) {
      if (action === 'hold') {
        // Acquiring initial lock
        const lockRequest: SeatLockRequest = {
          seatId: context.seatId,
          userId: context.userId,
          sessionId: context.sessionId,
          ttlMs: transition.lockTTLMs,
        };
        
        lockResult = await acquireSeatLock(lockRequest);
        
        if (!lockResult.success) {
          // Check if someone else holds the lock
          const lockStatus = await getSeatLockStatus(context.seatId);
          
          if (lockStatus.isLocked && lockStatus.owner) {
            recordLockConflict(context.seatId, context.userId, lockStatus.owner.userId);
            
            return {
              success: false,
              error: 'Seat is currently held by another user',
              conflictDetails: {
                currentOwner: `${lockStatus.owner.userId}:${lockStatus.owner.sessionId}`,
                currentState: 'locked', // Assume locked if lock exists
                retryAfterMs: lockStatus.remainingTtlMs,
              },
            };
          }
          
          return {
            success: false,
            error: lockResult.error || 'Failed to acquire seat lock',
            lockResult,
          };
        }
        
      } else {
        // Verify lock ownership for state transitions
        const hasLock = await isLockHeldByUser(context.seatId, context.userId, context.sessionId);
        
        if (!hasLock) {
          return {
            success: false,
            error: 'Cannot transition state - lock not held by user',
          };
        }
        
        // Extend lock if moving to reserved state (payment processing)
        if (action === 'reserve' && transition.lockTTLMs) {
          const extendResult = await extendSeatLockTTL(
            context.seatId,
            context.userId,
            context.sessionId,
            transition.lockTTLMs - 180000 // Extend by difference from current 3min lock
          );
          
          if (!extendResult.success) {
            return {
              success: false,
              error: 'Failed to extend lock for payment processing',
              lockResult: extendResult,
            };
          }
          
          lockResult = extendResult;
        }
      }
    }
    
    // Step 2: Create new context with updated state
    const newContext: BookingContext = {
      ...context,
      currentState: transition.toState,
    };
    
    // Update context based on transition
    switch (action) {
      case 'hold':
        newContext.lockAcquiredAt = new Date();
        break;
      
      case 'reserve':
        newContext.reservedAt = new Date();
        if (metadata?.paymentIntentId) {
          newContext.paymentIntentId = metadata.paymentIntentId;
        }
        break;
      
      case 'pay':
        // Payment successful - release lock and record success
        await releaseSeatLock(context.seatId, context.userId, context.sessionId);
        
        const totalDuration = Date.now() - startTime;
        recordSeatReservationSuccess(context.seatId, context.userId, totalDuration);
        
        if (context.lockAcquiredAt) {
          const lockToPaymentDuration = Date.now() - context.lockAcquiredAt.getTime();
          recordLockToPaymentDuration(context.seatId, context.userId, lockToPaymentDuration);
        }
        break;
      
      case 'release':
      case 'timeout':
        // Release lock and record failure
        if (context.currentState === 'locked' || context.currentState === 'reserved') {
          await releaseSeatLock(context.seatId, context.userId, context.sessionId);
        }
        
        const reason = action === 'timeout' ? 'timeout' : 'user_abandoned';
        recordSeatReservationFailure(context.seatId, context.userId, reason);
        
        // Clear contextual data
        newContext.lockAcquiredAt = undefined;
        newContext.reservedAt = undefined;
        newContext.paymentIntentId = undefined;
        break;
    }
    
    // Step 3: Invalidate cache if seat state changed to/from available
    if (transition.toState === 'available' || context.currentState === 'available') {
      await invalidateLayoutCache(context.venueId);
    }
    
    return {
      success: true,
      newState: transition.toState,
      newContext,
      lockResult,
    };
    
  } catch (error) {
    // Rollback: Release lock if we acquired it but transition failed
    if (lockResult?.success && action === 'hold') {
      try {
        await releaseSeatLock(context.seatId, context.userId, context.sessionId);
      } catch (rollbackError) {
        console.error('Failed to rollback lock after transition error:', rollbackError);
      }
    }
    
    recordSeatReservationFailure(context.seatId, context.userId, 'system_error');
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown FSM transition error',
    };
  }
}

// ================================================
// BULK OPERATIONS & BATCH PROCESSING
// ================================================

/**
 * Execute multiple transitions atomically (e.g., bulk seat selection)
 */
export async function executeBulkTransitions(
  requests: FSMTransitionRequest[]
): Promise<FSMTransitionResult[]> {
  const results: FSMTransitionResult[] = [];
  const acquiredLocks: string[] = [];
  
  try {
    // Execute all transitions
    for (const request of requests) {
      const result = await executeBookingTransition(request);
      results.push(result);
      
      // Track successful lock acquisitions for potential rollback
      if (result.success && result.lockResult?.success) {
        acquiredLocks.push(request.context.seatId);
      }
      
      // If any transition fails, rollback all acquired locks
      if (!result.success) {
        console.warn(`Bulk transition failed at seat ${request.context.seatId}, rolling back...`);
        
        // Rollback all successful lock acquisitions
        for (const seatId of acquiredLocks) {
          const context = requests.find(r => r.context.seatId === seatId)?.context;
          if (context) {
            await releaseSeatLock(seatId, context.userId, context.sessionId);
          }
        }
        
        break;
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('Bulk transition system error:', error);
    
    // Emergency rollback
    for (const seatId of acquiredLocks) {
      const context = requests.find(r => r.context.seatId === seatId)?.context;
      if (context) {
        try {
          await releaseSeatLock(seatId, context.userId, context.sessionId);
        } catch (rollbackError) {
          console.error(`Failed to rollback lock for seat ${seatId}:`, rollbackError);
        }
      }
    }
    
    return results;
  }
}

// ================================================
// STATE RECOVERY & RECONCILIATION
// ================================================

/**
 * Reconcile seat state with actual lock status (for recovery scenarios)
 */
export async function reconcileSeatState(context: BookingContext): Promise<BookingContext> {
  try {
    const lockStatus = await getSeatLockStatus(context.seatId);
    
    // If we think we have a lock but Redis says no
    if ((context.currentState === 'locked' || context.currentState === 'reserved') && !lockStatus.isLocked) {
      console.warn(`State reconciliation: ${context.seatId} state=${context.currentState} but no lock found`);
      
      return {
        ...context,
        currentState: 'released',
        lockAcquiredAt: undefined,
        reservedAt: undefined,
      };
    }
    
    // If Redis has a lock but for different user
    if (lockStatus.isLocked && lockStatus.owner) {
      const isOurLock = (lockStatus.owner.userId === context.userId && 
                        lockStatus.owner.sessionId === context.sessionId);
      
      if (!isOurLock && (context.currentState === 'locked' || context.currentState === 'reserved')) {
        console.warn(`State reconciliation: ${context.seatId} state conflict - lock held by different user`);
        
        return {
          ...context,
          currentState: 'available', // Reset to available
          lockAcquiredAt: undefined,
          reservedAt: undefined,
        };
      }
    }
    
    return context; // No reconciliation needed
    
  } catch (error) {
    console.error('State reconciliation error:', error);
    return context; // Return as-is on error
  }
}

/**
 * Clean up stale bookings (background job)
 */
export async function cleanupStaleBookings(): Promise<number> {
  try {
    // This would typically query a database for stale booking contexts
    // For now, this is a placeholder for the cleanup logic
    
    console.log('🧹 Stale booking cleanup not yet implemented (requires booking storage)');
    return 0;
    
  } catch (error) {
    console.error('Stale booking cleanup error:', error);
    return 0;
  }
}

// ================================================
// UTILITIES & HELPERS
// ================================================

/**
 * Check if a seat can be selected by a user
 */
export async function canUserSelectSeat(seatId: string, userId: string, sessionId: string): Promise<{
  canSelect: boolean;
  reason?: string;
  currentOwner?: string;
}> {
  try {
    const lockStatus = await getSeatLockStatus(seatId);
    
    if (!lockStatus.isLocked) {
      return { canSelect: true };
    }
    
    // Check if user already holds the lock
    if (lockStatus.owner?.userId === userId && lockStatus.owner?.sessionId === sessionId) {
      return { canSelect: true };
    }
    
    // Seat is locked by someone else
    return {
      canSelect: false,
      reason: 'Seat is currently held by another user',
      currentOwner: lockStatus.owner ? `${lockStatus.owner.userId}:${lockStatus.owner.sessionId}` : 'unknown',
    };
    
  } catch (error) {
    console.error('canUserSelectSeat error:', error);
    return {
      canSelect: false,
      reason: 'System error checking seat availability',
    };
  }
}

/**
 * Get booking state machine diagram (for documentation)
 */
export function getBookingStateDiagram(): string {
  return `
Booking State Machine:

available → [select] → selecting → [hold] → locked → [reserve] → reserved → [pay] → paid
    ↑           ↓           ↓           ↓           ↓
    └─[release]─┴───[release]─┴───[release]─┴───[timeout]───→ released → [release] → available
                                                              
blocked ←→ [block/unblock] ←→ available

Lock Requirements:
- hold: Acquires 3min lock
- reserve: Extends to 15min lock  
- pay: Releases lock
- release/timeout: Releases lock
`;
}