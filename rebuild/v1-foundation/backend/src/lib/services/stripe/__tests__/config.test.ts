/**
 * Config Layer Unit Tests
 * ======================
 * 
 * Tests for extracted constants and FSM rules
 * Ensures config extraction didn't break anything
 */

import { describe, it, expect } from '@jest/globals';
import { 
  WEBHOOK_CONFIG, 
  IDEMPOTENCY_CONFIG, 
  DEDUPLICATION_CONFIG,
  FSM_CONFIG,
  STRIPE_ERROR_CODES,
  SEAT_LOCK_CONFIG
} from '../config/constants';

import {
  type BookingStatus,
  type PaymentStatus,
  VALID_BOOKING_TRANSITIONS,
  VALID_PAYMENT_TRANSITIONS,
  isValidBookingTransition,
  isValidPaymentTransition,
  isTerminalBookingState,
  isTerminalPaymentState,
  getValidBookingTransitions,
  getValidPaymentTransitions,
  isBookingStatePayable
} from '../config/fsm-rules';

// ================================================
// CONSTANTS TESTS
// ================================================

describe('Config Constants', () => {
  
  it('should have valid webhook configuration', () => {
    expect(WEBHOOK_CONFIG.TIMEOUT_SECONDS).toBe(300);
    expect(WEBHOOK_CONFIG.MAX_PAYLOAD_SIZE).toBe(1024 * 1024);
    expect(WEBHOOK_CONFIG.MAX_RETRIES).toBe(3);
    expect(WEBHOOK_CONFIG.RETRY_DELAY_BASE_MS).toBe(1000);
  });

  it('should have valid idempotency configuration', () => {
    expect(IDEMPOTENCY_CONFIG.IDEMPOTENCY_TTL_SECONDS).toBe(86400); // 24 hours
    expect(IDEMPOTENCY_CONFIG.PROCESSING_LOCK_TTL_SECONDS).toBe(300); // 5 minutes
    expect(IDEMPOTENCY_CONFIG.MAX_PAYLOAD_SIZE_FOR_HASH).toBe(1024 * 512); // 512KB
    expect(IDEMPOTENCY_CONFIG.MAX_IDEMPOTENCY_KEYS_PER_HOUR).toBe(10000);
  });

  it('should have valid FSM configuration', () => {
    expect(FSM_CONFIG.TRANSITION_TIMEOUT_SECONDS).toBe(60);
    expect(FSM_CONFIG.LOCK_TIMEOUT_SECONDS).toBe(60);
    expect(FSM_CONFIG.MAX_TRANSITION_RETRIES).toBe(3);
    expect(FSM_CONFIG.TRANSITION_CACHE_TTL_SECONDS).toBe(86400); // 24 hours
  });

  it('should have valid deduplication configuration', () => {
    expect(DEDUPLICATION_CONFIG.MAX_PROCESSING_TIME_SECONDS).toBe(300);
    expect(DEDUPLICATION_CONFIG.MAX_RETRY_ATTEMPTS).toBe(3);
    expect(DEDUPLICATION_CONFIG.RETRY_BASE_DELAY_MS).toBe(100);
  });

  it('should have retryable error codes defined', () => {
    expect(STRIPE_ERROR_CODES.RETRYABLE.has('card_declined')).toBe(true);
    expect(STRIPE_ERROR_CODES.RETRYABLE.has('insufficient_funds')).toBe(true);
    expect(STRIPE_ERROR_CODES.RETRYABLE.has('processing_error')).toBe(true);
  });

  it('should have hard failure codes defined', () => {
    expect(STRIPE_ERROR_CODES.HARD_FAILURE.has('fraudulent')).toBe(true);
    expect(STRIPE_ERROR_CODES.HARD_FAILURE.has('stolen_card')).toBe(true);
    expect(STRIPE_ERROR_CODES.HARD_FAILURE.has('expired_card')).toBe(true);
  });
});

// ================================================
// FSM RULES TESTS
// ================================================

describe('FSM State Transition Rules', () => {
  
  it('should validate correct booking transitions', () => {
    expect(isValidBookingTransition('draft', 'pending_payment')).toBe(true);
    expect(isValidBookingTransition('pending_payment', 'confirmed')).toBe(true);
    expect(isValidBookingTransition('confirmed', 'refunded')).toBe(true);
  });

  it('should reject invalid booking transitions', () => {
    expect(isValidBookingTransition('confirmed', 'draft')).toBe(false);
    expect(isValidBookingTransition('refunded', 'confirmed')).toBe(false);
    expect(isValidBookingTransition('canceled', 'pending_payment')).toBe(false);
  });

  it('should validate correct payment transitions', () => {
    expect(isValidPaymentTransition('pending', 'processing')).toBe(true);
    expect(isValidPaymentTransition('processing', 'succeeded')).toBe(true);
    expect(isValidPaymentTransition('failed', 'pending')).toBe(true); // Allow retry
  });

  it('should reject invalid payment transitions', () => {
    expect(isValidPaymentTransition('succeeded', 'pending')).toBe(false);
    expect(isValidPaymentTransition('refunded', 'succeeded')).toBe(false);
    expect(isValidPaymentTransition('canceled', 'processing')).toBe(false);
  });

  it('should identify terminal states correctly', () => {
    expect(isTerminalBookingState('canceled')).toBe(true);
    expect(isTerminalBookingState('refunded')).toBe(true);
    expect(isTerminalBookingState('transferred')).toBe(true);
    expect(isTerminalBookingState('pending_payment')).toBe(false);
    
    expect(isTerminalPaymentState('canceled')).toBe(true);
    expect(isTerminalPaymentState('refunded')).toBe(true);
    expect(isTerminalPaymentState('processing')).toBe(false);
  });

  it('should identify payable booking states correctly', () => {
    expect(isBookingStatePayable('pending_payment')).toBe(true);
    expect(isBookingStatePayable('partially_paid')).toBe(true);
    expect(isBookingStatePayable('fraud_hold')).toBe(true);
    expect(isBookingStatePayable('confirmed')).toBe(false);
    expect(isBookingStatePayable('canceled')).toBe(false);
  });

  it('should return valid transitions for states', () => {
    const draftTransitions = getValidBookingTransitions('draft');
    expect(draftTransitions).toEqual(['pending_payment', 'canceled', 'expired']);
    
    const pendingTransitions = getValidPaymentTransitions('pending');
    expect(pendingTransitions).toEqual(['processing', 'failed', 'canceled']);
  });
});

// ================================================
// CONFIG CONSISTENCY TESTS
// ================================================

describe('Config Consistency', () => {
  
  it('should have consistent TTL values', () => {
    // Idempotency and FSM should have same cache TTL
    expect(IDEMPOTENCY_CONFIG.IDEMPOTENCY_TTL_SECONDS)
      .toBe(FSM_CONFIG.TRANSITION_CACHE_TTL_SECONDS);
      
    // Processing locks should be shorter than overall cache
    expect(IDEMPOTENCY_CONFIG.PROCESSING_LOCK_TTL_SECONDS)
      .toBeLessThan(IDEMPOTENCY_CONFIG.IDEMPOTENCY_TTL_SECONDS);
  });

  it('should have no overlap between retryable and hard failure codes', () => {
    const retryable = Array.from(STRIPE_ERROR_CODES.RETRYABLE);
    const hardFailure = Array.from(STRIPE_ERROR_CODES.HARD_FAILURE);
    
    const overlap = retryable.filter(code => hardFailure.includes(code));
    expect(overlap).toEqual([]);
  });

  it('should have all booking statuses defined in transitions', () => {
    const allBookingStates: BookingStatus[] = [
      'draft', 'pending_payment', 'confirmed', 'partially_paid',
      'canceled', 'refunded', 'expired', 'disputed', 'fraud_hold', 'transferred'
    ];
    
    const transitionKeys = Object.keys(VALID_BOOKING_TRANSITIONS) as BookingStatus[];
    expect(transitionKeys.sort()).toEqual(allBookingStates.sort());
  });

  it('should have all payment statuses defined in transitions', () => {
    const allPaymentStates: PaymentStatus[] = [
      'pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded', 'disputed'
    ];
    
    const transitionKeys = Object.keys(VALID_PAYMENT_TRANSITIONS) as PaymentStatus[];
    expect(transitionKeys.sort()).toEqual(allPaymentStates.sort());
  });
});