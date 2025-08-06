/**
 * State Validator Unit Tests
 * =========================
 * 
 * Comprehensive tests for pure validation functions
 * Covers all edge cases and error conditions
 */

import { describe, it, expect } from '@jest/globals';
import { 
  StateValidator,
  createStateValidator,
  type ValidationResult,
  type StateValidationContext
} from '../utils/state-validator';
import type { BookingStatus, PaymentStatus } from '../config/fsm-rules';

// ================================================
// TEST SETUP
// ================================================

describe('State Validator', () => {
  let validator: StateValidator;

  beforeEach(() => {
    validator = createStateValidator();
  });

  // ================================================
  // BOOKING VALIDATION TESTS
  // ================================================

  describe('validateBookingExists', () => {
    it('should validate valid UUID booking IDs', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = validator.validateBookingExists(validUuid);
      
      expect(result.isValid).toBe(true);
      expect(result.errorCode).toBeUndefined();
      expect(result.errorMessage).toBeUndefined();
    });

    it('should reject null or undefined booking IDs', () => {
      const nullResult = validator.validateBookingExists(null as any);
      const undefinedResult = validator.validateBookingExists(undefined as any);
      
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.errorCode).toBe('INVALID_BOOKING_ID');
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.errorCode).toBe('INVALID_BOOKING_ID');
    });

    it('should reject non-string booking IDs', () => {
      const numberResult = validator.validateBookingExists(123 as any);
      const objectResult = validator.validateBookingExists({} as any);
      
      expect(numberResult.isValid).toBe(false);
      expect(numberResult.errorCode).toBe('INVALID_BOOKING_ID');
      expect(objectResult.isValid).toBe(false);
      expect(objectResult.errorCode).toBe('INVALID_BOOKING_ID');
    });

    it('should reject invalid UUID formats', () => {
      const invalidFormats = [
        'not-a-uuid',
        '123',
        '123e4567-e89b-12d3-a456',  // Too short
        '123e4567-e89b-12d3-a456-426614174000-extra',  // Too long
        'ggge4567-e89b-12d3-a456-426614174000',  // Invalid characters
      ];

      invalidFormats.forEach(invalidId => {
        const result = validator.validateBookingExists(invalidId);
        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe('INVALID_BOOKING_ID_FORMAT');
      });
    });
  });

  describe('validateBookingStateForPayment', () => {
    it('should accept valid payment states', () => {
      const validStates: BookingStatus[] = ['pending_payment', 'partially_paid', 'fraud_hold'];
      
      validStates.forEach(state => {
        const result = validator.validateBookingStateForPayment(state);
        expect(result.isValid).toBe(true);
        expect(result.errorCode).toBeUndefined();
      });
    });

    it('should reject invalid payment states', () => {
      const invalidStates: BookingStatus[] = ['confirmed', 'canceled', 'refunded', 'expired', 'draft'];
      
      invalidStates.forEach(state => {
        const result = validator.validateBookingStateForPayment(state);
        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe('INVALID_BOOKING_STATE_FOR_PAYMENT');
        expect(result.errorMessage).toContain(state);
      });
    });
  });

  // ================================================
  // FSM TRANSITION VALIDATION TESTS
  // ================================================

  describe('validateTransition', () => {
    it('should validate correct booking and payment transitions', () => {
      const validContext: StateValidationContext = {
        bookingId: '123e4567-e89b-12d3-a456-426614174000',
        currentBookingStatus: 'pending_payment',
        targetBookingStatus: 'confirmed',
        currentPaymentStatus: 'processing',
        targetPaymentStatus: 'succeeded',
        stripeEventType: 'payment_intent.succeeded'
      };

      const result = validator.validateTransition(validContext);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid booking transitions', () => {
      const invalidContext: StateValidationContext = {
        bookingId: '123e4567-e89b-12d3-a456-426614174000',
        currentBookingStatus: 'confirmed',  // Can't go back to draft
        targetBookingStatus: 'draft',
        currentPaymentStatus: 'succeeded',
        targetPaymentStatus: 'succeeded',
        stripeEventType: 'payment_intent.succeeded'
      };

      const result = validator.validateTransition(invalidContext);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INVALID_BOOKING_TRANSITION');
      expect(result.errorMessage).toContain('confirmed → draft');
    });

    it('should reject invalid payment transitions', () => {
      const invalidContext: StateValidationContext = {
        bookingId: '123e4567-e89b-12d3-a456-426614174000',
        currentBookingStatus: 'pending_payment',
        targetBookingStatus: 'confirmed',
        currentPaymentStatus: 'succeeded',  // Can't go back to pending
        targetPaymentStatus: 'pending',
        stripeEventType: 'payment_intent.succeeded'
      };

      const result = validator.validateTransition(invalidContext);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INVALID_PAYMENT_TRANSITION');
      expect(result.errorMessage).toContain('succeeded → pending');
    });
  });

  // ================================================
  // STRIPE EVENT VALIDATION TESTS
  // ================================================

  describe('validateStripeEvent', () => {
    it('should validate payment_intent.succeeded with correct states', () => {
      const result = validator.validateStripeEvent(
        'payment_intent.succeeded',
        { booking: 'confirmed', payment: 'succeeded' }
      );

      expect(result.isValid).toBe(true);
    });

    it('should validate payment_intent.payment_failed with correct states', () => {
      const result = validator.validateStripeEvent(
        'payment_intent.payment_failed',
        { booking: 'expired', payment: 'failed' }
      );

      expect(result.isValid).toBe(true);
    });

    it('should reject unsupported event types', () => {
      const result = validator.validateStripeEvent(
        'unsupported.event.type',
        { booking: 'confirmed', payment: 'succeeded' }
      );

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('UNSUPPORTED_EVENT_TYPE');
      expect(result.errorMessage).toContain('unsupported.event.type');
    });

    it('should reject event with incorrect state mapping', () => {
      const result = validator.validateStripeEvent(
        'payment_intent.succeeded',
        { booking: 'expired', payment: 'failed' }  // Wrong states for success
      );

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('EVENT_STATE_MISMATCH');
      expect(result.errorMessage).toContain('payment_intent.succeeded');
    });
  });

  // ================================================
  // STRIPE ID VALIDATION TESTS
  // ================================================

  describe('validateStripePaymentIntentId', () => {
    it('should validate correct payment intent IDs', () => {
      const validIds = [
        'pi_1234567890abcdef',
        'pi_test_1234567890',
        'pi_live_9876543210'
      ];

      validIds.forEach(id => {
        const result = validator.validateStripePaymentIntentId(id);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject null or undefined payment intent IDs', () => {
      const nullResult = validator.validateStripePaymentIntentId(null as any);
      const undefinedResult = validator.validateStripePaymentIntentId(undefined as any);

      expect(nullResult.isValid).toBe(false);
      expect(nullResult.errorCode).toBe('INVALID_PAYMENT_INTENT_ID');
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.errorCode).toBe('INVALID_PAYMENT_INTENT_ID');
    });

    it('should reject non-string payment intent IDs', () => {
      const result = validator.validateStripePaymentIntentId(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INVALID_PAYMENT_INTENT_ID');
    });

    it('should reject payment intent IDs without pi_ prefix', () => {
      const invalidIds = [
        'ch_1234567890abcdef',  // Charge ID
        'cs_1234567890abcdef',  // Checkout session ID
        '1234567890abcdef',     // No prefix
        'payment_intent_123'    // Wrong format
      ];

      invalidIds.forEach(id => {
        const result = validator.validateStripePaymentIntentId(id);
        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe('INVALID_PAYMENT_INTENT_ID_FORMAT');
      });
    });
  });

  describe('validateStripeEventId', () => {
    it('should validate correct event IDs', () => {
      const validIds = [
        'evt_1234567890abcdef',
        'evt_test_1234567890',
        'evt_live_9876543210'
      ];

      validIds.forEach(id => {
        const result = validator.validateStripeEventId(id);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject null or undefined event IDs', () => {
      const nullResult = validator.validateStripeEventId(null as any);
      const undefinedResult = validator.validateStripeEventId(undefined as any);

      expect(nullResult.isValid).toBe(false);
      expect(nullResult.errorCode).toBe('INVALID_EVENT_ID');
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.errorCode).toBe('INVALID_EVENT_ID');
    });

    it('should reject event IDs without evt_ prefix', () => {
      const invalidIds = [
        'pi_1234567890abcdef',  // Payment intent ID
        '1234567890abcdef',     // No prefix
        'event_123'             // Wrong format
      ];

      invalidIds.forEach(id => {
        const result = validator.validateStripeEventId(id);
        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe('INVALID_EVENT_ID_FORMAT');
      });
    });
  });

  // ================================================
  // FACTORY FUNCTION TESTS
  // ================================================

  describe('createStateValidator', () => {
    it('should create a new StateValidator instance', () => {
      const validator1 = createStateValidator();
      const validator2 = createStateValidator();

      expect(validator1).toBeInstanceOf(StateValidator);
      expect(validator2).toBeInstanceOf(StateValidator);
      expect(validator1).not.toBe(validator2); // Different instances
    });
  });

  // ================================================
  // INTEGRATION TESTS
  // ================================================

  describe('Integration scenarios', () => {
    it('should validate complete payment success flow', () => {
      const bookingValidation = validator.validateBookingExists('123e4567-e89b-12d3-a456-426614174000');
      const stateValidation = validator.validateBookingStateForPayment('pending_payment');
      const eventValidation = validator.validateStripeEvent(
        'payment_intent.succeeded',
        { booking: 'confirmed', payment: 'succeeded' }
      );
      const paymentIdValidation = validator.validateStripePaymentIntentId('pi_1234567890abcdef');
      const eventIdValidation = validator.validateStripeEventId('evt_1234567890abcdef');

      expect(bookingValidation.isValid).toBe(true);
      expect(stateValidation.isValid).toBe(true);
      expect(eventValidation.isValid).toBe(true);
      expect(paymentIdValidation.isValid).toBe(true);
      expect(eventIdValidation.isValid).toBe(true);
    });

    it('should validate complete payment failure flow', () => {
      const stateValidation = validator.validateBookingStateForPayment('pending_payment');
      const eventValidation = validator.validateStripeEvent(
        'payment_intent.payment_failed',
        { booking: 'expired', payment: 'failed' }
      );

      expect(stateValidation.isValid).toBe(true);
      expect(eventValidation.isValid).toBe(true);
    });
  });
});