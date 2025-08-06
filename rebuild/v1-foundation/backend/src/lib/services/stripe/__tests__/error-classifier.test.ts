/**
 * Error Classifier Unit Tests
 * ===========================
 * 
 * Comprehensive tests for Stripe error classification
 * Covers all error codes and classification scenarios
 */

import { describe, it, expect } from '@jest/globals';
import { 
  StripeErrorClassifier,
  createStripeErrorClassifier,
  type FailureClassification,
  type StripeErrorDetails
} from '../utils/error-classifier';

// ================================================
// TEST SETUP
// ================================================

describe('Stripe Error Classifier', () => {
  let classifier: StripeErrorClassifier;

  beforeEach(() => {
    classifier = createStripeErrorClassifier();
  });

  // ================================================
  // PAYMENT INTENT CLASSIFICATION TESTS
  // ================================================

  describe('classifyPaymentFailure', () => {
    it('should classify payment intent with no error as hard failure', () => {
      const paymentIntent = {
        id: 'pi_test_123',
        amount: 2000,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: null
      };

      const result = classifier.classifyPaymentFailure(paymentIntent);

      expect(result.type).toBe('hard');
      expect(result.reason).toBe('unknown_error');
      expect(result.retryable).toBe(false);
      expect(result.shouldReleaseSeats).toBe(true);
      expect(result.description).toContain('no error details');
    });

    it('should classify payment intent with card declined as soft failure', () => {
      const paymentIntent = {
        id: 'pi_test_123',
        amount: 2000,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined.',
          type: 'card_error'
        }
      };

      const result = classifier.classifyPaymentFailure(paymentIntent);

      expect(result.type).toBe('soft');
      expect(result.reason).toBe('card_declined');
      expect(result.retryable).toBe(true);
      expect(result.shouldReleaseSeats).toBe(false);
      expect(result.description).toContain('card_declined');
      expect(result.description).toContain('retryable');
    });

    it('should classify payment intent with fraudulent card as hard failure', () => {
      const paymentIntent = {
        id: 'pi_test_123',
        amount: 2000,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'fraudulent',
          message: 'Your card was declined.',
          type: 'card_error'
        }
      };

      const result = classifier.classifyPaymentFailure(paymentIntent);

      expect(result.type).toBe('hard');
      expect(result.reason).toBe('fraudulent');
      expect(result.retryable).toBe(false);
      expect(result.shouldReleaseSeats).toBe(true);
      expect(result.description).toContain('Hard failure');
    });
  });

  // ================================================
  // STRIPE ERROR CLASSIFICATION TESTS
  // ================================================

  describe('classifyStripeError', () => {
    it('should classify retryable error codes as soft failures', () => {
      const retryableErrors = [
        'card_declined',
        'insufficient_funds',
        'generic_decline',
        'processing_error',
        'issuer_not_available',
        'try_again_later',
        'authentication_required'
      ];

      retryableErrors.forEach(errorCode => {
        const error: StripeErrorDetails = {
          code: errorCode,
          message: `Test error: ${errorCode}`
        };

        const result = classifier.classifyStripeError(error);

        expect(result.type).toBe('soft');
        expect(result.reason).toBe(errorCode);
        expect(result.retryable).toBe(true);
        expect(result.shouldReleaseSeats).toBe(false);
      });
    });

    it('should classify hard failure error codes as hard failures', () => {
      const hardFailureErrors = [
        'fraudulent',
        'stolen_card',
        'lost_card',
        'pickup_card',
        'restricted_card',
        'security_violation',
        'invalid_account',
        'card_not_supported',
        'currency_not_supported',
        'duplicate_transaction',
        'expired_card',
        'incorrect_cvc',
        'incorrect_number',
        'invalid_cvc',
        'invalid_expiry_month',
        'invalid_expiry_year',
        'invalid_number'
      ];

      hardFailureErrors.forEach(errorCode => {
        const error: StripeErrorDetails = {
          code: errorCode,
          message: `Test error: ${errorCode}`
        };

        const result = classifier.classifyStripeError(error);

        expect(result.type).toBe('hard');
        expect(result.reason).toBe(errorCode);
        expect(result.retryable).toBe(false);
        expect(result.shouldReleaseSeats).toBe(true);
      });
    });

    it('should classify retryable decline codes as soft failures', () => {
      const retryableDeclineCodes = [
        'insufficient_funds',
        'generic_decline',
        'try_again_later',
        'processing_error'
      ];

      retryableDeclineCodes.forEach(declineCode => {
        const error: StripeErrorDetails = {
          decline_code: declineCode,
          message: `Test decline: ${declineCode}`
        };

        const result = classifier.classifyStripeError(error);

        expect(result.type).toBe('soft');
        expect(result.reason).toBe(declineCode);
        expect(result.retryable).toBe(true);
        expect(result.shouldReleaseSeats).toBe(false);
      });
    });

    it('should default unknown errors to soft failures', () => {
      const unknownError: StripeErrorDetails = {
        code: 'unknown_error_code',
        message: 'Some unknown error occurred'
      };

      const result = classifier.classifyStripeError(unknownError);

      expect(result.type).toBe('soft');
      expect(result.reason).toBe('unknown_error_code');
      expect(result.retryable).toBe(true);
      expect(result.shouldReleaseSeats).toBe(false);
      expect(result.description).toContain('defaulting to retryable');
    });

    it('should handle errors with both code and decline_code', () => {
      const error: StripeErrorDetails = {
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        message: 'Card declined due to insufficient funds'
      };

      const result = classifier.classifyStripeError(error);

      // Should use the error code first
      expect(result.type).toBe('soft');
      expect(result.reason).toBe('card_declined');
      expect(result.retryable).toBe(true);
    });
  });

  // ================================================
  // SPECIFIC CLASSIFICATION TESTS
  // ================================================

  describe('isFraudRelated', () => {
    it('should identify fraud-related error codes', () => {
      const fraudCodes = ['fraudulent', 'stolen_card', 'lost_card', 'pickup_card', 'security_violation'];
      
      fraudCodes.forEach(code => {
        expect(classifier.isFraudRelated(code)).toBe(true);
      });
    });

    it('should not identify non-fraud codes as fraud-related', () => {
      const nonFraudCodes = ['card_declined', 'insufficient_funds', 'expired_card'];
      
      nonFraudCodes.forEach(code => {
        expect(classifier.isFraudRelated(code)).toBe(false);
      });
    });
  });

  describe('isCardIssue', () => {
    it('should identify card-related error codes', () => {
      const cardCodes = ['card_declined', 'expired_card', 'incorrect_cvc', 'invalid_cvc'];
      
      cardCodes.forEach(code => {
        expect(classifier.isCardIssue(code)).toBe(true);
      });
    });

    it('should not identify non-card codes as card issues', () => {
      const nonCardCodes = ['fraudulent', 'insufficient_funds', 'processing_error'];
      
      nonCardCodes.forEach(code => {
        expect(classifier.isCardIssue(code)).toBe(false);
      });
    });
  });

  describe('isInsufficientFunds', () => {
    it('should identify insufficient funds error', () => {
      expect(classifier.isInsufficientFunds('insufficient_funds')).toBe(true);
    });

    it('should not identify other errors as insufficient funds', () => {
      const otherCodes = ['card_declined', 'fraudulent', 'processing_error'];
      
      otherCodes.forEach(code => {
        expect(classifier.isInsufficientFunds(code)).toBe(false);
      });
    });
  });

  describe('isProcessingError', () => {
    it('should identify processing-related error codes', () => {
      const processingCodes = ['processing_error', 'issuer_not_available', 'try_again_later'];
      
      processingCodes.forEach(code => {
        expect(classifier.isProcessingError(code)).toBe(true);
      });
    });

    it('should not identify non-processing codes as processing errors', () => {
      const nonProcessingCodes = ['card_declined', 'fraudulent', 'insufficient_funds'];
      
      nonProcessingCodes.forEach(code => {
        expect(classifier.isProcessingError(code)).toBe(false);
      });
    });
  });

  // ================================================
  // HELPER FUNCTION TESTS
  // ================================================

  describe('isRetryableError', () => {
    it('should identify retryable error codes', () => {
      expect(classifier.isRetryableError('card_declined')).toBe(true);
      expect(classifier.isRetryableError('insufficient_funds')).toBe(true);
      expect(classifier.isRetryableError('processing_error')).toBe(true);
    });

    it('should identify retryable decline codes', () => {
      expect(classifier.isRetryableError('unknown_code', 'insufficient_funds')).toBe(true);
      expect(classifier.isRetryableError('unknown_code', 'generic_decline')).toBe(true);
    });

    it('should not identify hard failure codes as retryable', () => {
      expect(classifier.isRetryableError('fraudulent')).toBe(false);
      expect(classifier.isRetryableError('stolen_card')).toBe(false);
    });
  });

  describe('isHardFailureError', () => {
    it('should identify hard failure error codes', () => {
      expect(classifier.isHardFailureError('fraudulent')).toBe(true);
      expect(classifier.isHardFailureError('stolen_card')).toBe(true);
      expect(classifier.isHardFailureError('expired_card')).toBe(true);
    });

    it('should not identify soft failure codes as hard failures', () => {
      expect(classifier.isHardFailureError('card_declined')).toBe(false);
      expect(classifier.isHardFailureError('insufficient_funds')).toBe(false);
    });
  });

  describe('getErrorCategory', () => {
    it('should categorize fraud errors', () => {
      expect(classifier.getErrorCategory('fraudulent')).toBe('fraud');
      expect(classifier.getErrorCategory('stolen_card')).toBe('fraud');
    });

    it('should categorize card errors', () => {
      expect(classifier.getErrorCategory('card_declined')).toBe('card');
      expect(classifier.getErrorCategory('expired_card')).toBe('card');
    });

    it('should categorize funds errors', () => {
      expect(classifier.getErrorCategory('insufficient_funds')).toBe('funds');
    });

    it('should categorize processing errors', () => {
      expect(classifier.getErrorCategory('processing_error')).toBe('processing');
      expect(classifier.getErrorCategory('try_again_later')).toBe('processing');
    });

    it('should categorize unknown errors as other', () => {
      expect(classifier.getErrorCategory('unknown_error')).toBe('other');
      expect(classifier.getErrorCategory('custom_error')).toBe('other');
    });
  });

  describe('shouldReleaseSeatsForError', () => {
    it('should recommend releasing seats for hard failures', () => {
      const hardFailure: FailureClassification = {
        type: 'hard',
        reason: 'fraudulent',
        retryable: false,
        shouldReleaseSeats: true,
        description: 'Hard failure'
      };

      expect(classifier.shouldReleaseSeatsForError(hardFailure)).toBe(true);
    });

    it('should follow recommendation for soft failures', () => {
      const softFailureKeepSeats: FailureClassification = {
        type: 'soft',
        reason: 'card_declined',
        retryable: true,
        shouldReleaseSeats: false,
        description: 'Soft failure'
      };

      const softFailureReleaseSeats: FailureClassification = {
        type: 'soft',
        reason: 'some_edge_case',
        retryable: true,
        shouldReleaseSeats: true,
        description: 'Soft failure with seat release'
      };

      expect(classifier.shouldReleaseSeatsForError(softFailureKeepSeats)).toBe(false);
      expect(classifier.shouldReleaseSeatsForError(softFailureReleaseSeats)).toBe(true);
    });
  });

  // ================================================
  // FACTORY FUNCTION TESTS
  // ================================================

  describe('createStripeErrorClassifier', () => {
    it('should create a new StripeErrorClassifier instance', () => {
      const classifier1 = createStripeErrorClassifier();
      const classifier2 = createStripeErrorClassifier();

      expect(classifier1).toBeInstanceOf(StripeErrorClassifier);
      expect(classifier2).toBeInstanceOf(StripeErrorClassifier);
      expect(classifier1).not.toBe(classifier2); // Different instances
    });
  });

  // ================================================
  // INTEGRATION TESTS
  // ================================================

  describe('Integration scenarios', () => {
    it('should handle complete payment failure classification flow', () => {
      const paymentIntent = {
        id: 'pi_test_failure',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'insufficient_funds',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
          type: 'card_error',
          payment_method: {
            id: 'pm_test_123',
            type: 'card'
          }
        }
      };

      const classification = classifier.classifyPaymentFailure(paymentIntent);
      const isRetryable = classifier.isRetryableError(classification.reason);
      const category = classifier.getErrorCategory(classification.reason);
      const shouldRelease = classifier.shouldReleaseSeatsForError(classification);

      expect(classification.type).toBe('soft');
      expect(classification.retryable).toBe(true);
      expect(isRetryable).toBe(true);
      expect(category).toBe('funds');
      expect(shouldRelease).toBe(false);
    });

    it('should handle fraud detection flow', () => {
      const paymentIntent = {
        id: 'pi_test_fraud',
        amount: 10000,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'fraudulent',
          message: 'Your card was declined.',
          type: 'card_error'
        }
      };

      const classification = classifier.classifyPaymentFailure(paymentIntent);
      const isFraud = classifier.isFraudRelated(classification.reason);
      const isHardFailure = classifier.isHardFailureError(classification.reason);
      const shouldRelease = classifier.shouldReleaseSeatsForError(classification);

      expect(classification.type).toBe('hard');
      expect(classification.retryable).toBe(false);
      expect(isFraud).toBe(true);
      expect(isHardFailure).toBe(true);
      expect(shouldRelease).toBe(true);
    });
  });
});