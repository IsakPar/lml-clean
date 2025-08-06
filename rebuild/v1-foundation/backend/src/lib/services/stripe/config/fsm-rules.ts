/**
 * FSM State Transition Rules
 * ==========================
 * 
 * Pure FSM logic and validation rules
 * Following Redis Gold Standard: single concern, <150 LOC
 * 
 * ✅ Extracted from legacy/payment-fsm-manager.ts - VALID_BOOKING_TRANSITIONS, VALID_PAYMENT_TRANSITIONS
 */

// ================================================
// FSM TYPES (from legacy/payment-fsm-manager.ts)
// ================================================

export type BookingStatus = 
  | 'draft'
  | 'pending_payment' 
  | 'confirmed'
  | 'partially_paid'
  | 'canceled'
  | 'refunded'
  | 'expired'
  | 'disputed'
  | 'fraud_hold'
  | 'transferred';

export type PaymentStatus =
  | 'pending'
  | 'processing' 
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'disputed';

// ================================================
// TRANSITION RULES (extracted from legacy/payment-fsm-manager.ts)
// ================================================

export const VALID_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  'draft': ['pending_payment', 'canceled', 'expired'],
  'pending_payment': ['confirmed', 'canceled', 'expired', 'fraud_hold'],
  'confirmed': ['refunded', 'disputed', 'transferred'],
  'partially_paid': ['confirmed', 'refunded', 'canceled'],
  'canceled': [], // Terminal state
  'refunded': [], // Terminal state  
  'expired': [], // Terminal state
  'disputed': ['refunded', 'confirmed'], // Can be resolved
  'fraud_hold': ['confirmed', 'canceled'], // After manual review
  'transferred': [], // Terminal state
};

export const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  'pending': ['processing', 'failed', 'canceled'],
  'processing': ['succeeded', 'failed', 'canceled'],
  'succeeded': ['refunded', 'disputed'],
  'failed': ['pending'], // Allow retry
  'canceled': [], // Terminal state
  'refunded': [], // Terminal state
  'disputed': ['succeeded', 'refunded'], // Can be resolved
};

// ================================================
// VALIDATION FUNCTIONS
// ================================================

export function isValidBookingTransition(
  from: BookingStatus, 
  to: BookingStatus
): boolean {
  const allowedTransitions = VALID_BOOKING_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

export function isValidPaymentTransition(
  from: PaymentStatus, 
  to: PaymentStatus
): boolean {
  const allowedTransitions = VALID_PAYMENT_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

export function isTerminalBookingState(state: BookingStatus): boolean {
  return VALID_BOOKING_TRANSITIONS[state].length === 0;
}

export function isTerminalPaymentState(state: PaymentStatus): boolean {
  return VALID_PAYMENT_TRANSITIONS[state].length === 0;
}

// ================================================
// STATE HELPERS
// ================================================

export function getValidBookingTransitions(state: BookingStatus): BookingStatus[] {
  return VALID_BOOKING_TRANSITIONS[state] || [];
}

export function getValidPaymentTransitions(state: PaymentStatus): PaymentStatus[] {
  return VALID_PAYMENT_TRANSITIONS[state] || [];
}

export function isBookingStatePayable(state: BookingStatus): boolean {
  const payableStates: BookingStatus[] = ['pending_payment', 'partially_paid', 'fraud_hold'];
  return payableStates.includes(state);
}

// LOC: 89 lines - under 150 ✅