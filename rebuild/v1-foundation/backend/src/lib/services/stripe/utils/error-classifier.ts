/**
 * Stripe Error Classification Utilities
 * =====================================
 * 
 * Pure functions for classifying Stripe errors as soft/hard failures
 * Following Redis Gold Standard: single concern, <150 LOC
 * 
 * ✅ Extracted from legacy/payment-intent-failed.ts lines 271-329
 */

import { STRIPE_ERROR_CODES } from '../config/constants';

// ================================================
// CLASSIFICATION TYPES
// ================================================

export interface FailureClassification {
  type: 'soft' | 'hard';
  reason: string;
  retryable: boolean;
  shouldReleaseSeats: boolean;
  description: string;
}

export interface StripeErrorDetails {
  code?: string;
  decline_code?: string;
  message?: string;
  type?: string;
  payment_method?: {
    id: string;
    type: string;
  };
}

// ================================================
// ERROR CLASSIFIER CLASS
// ================================================

export class StripeErrorClassifier {
  
  // ================================================
  // MAIN CLASSIFICATION
  // ================================================

  classifyPaymentFailure(paymentIntent: any): FailureClassification {
    // Extracted from legacy/payment-intent-failed.ts lines 272-283
    const error = paymentIntent.last_payment_error;
    
    if (!error) {
      return {
        type: 'hard',
        reason: 'unknown_error',
        retryable: false,
        shouldReleaseSeats: true,
        description: 'Payment failed with no error details'
      };
    }

    return this.classifyStripeError(error);
  }

  classifyStripeError(error: StripeErrorDetails): FailureClassification {
    // Extracted from legacy/payment-intent-failed.ts lines 285-329
    const errorCode = error.code;
    const declineCode = error.decline_code;

    // Check for hard failure codes first (security/fraud)
    if (errorCode && STRIPE_ERROR_CODES.HARD_FAILURE.has(errorCode)) {
      return {
        type: 'hard',
        reason: errorCode,
        retryable: false,
        shouldReleaseSeats: true,
        description: `Hard failure: ${error.message || errorCode}`
      };
    }

    // Check for retryable error codes
    if (errorCode && STRIPE_ERROR_CODES.RETRYABLE.has(errorCode)) {
      return {
        type: 'soft',
        reason: errorCode,
        retryable: true,
        shouldReleaseSeats: false,
        description: `Soft failure: ${error.message || errorCode} (retryable)`
      };
    }

    // Check decline codes
    if (declineCode && STRIPE_ERROR_CODES.RETRYABLE_DECLINE.has(declineCode)) {
      return {
        type: 'soft',
        reason: declineCode,
        retryable: true,
        shouldReleaseSeats: false,
        description: `Soft failure: ${error.message || declineCode} (retryable)`
      };
    }

    // Default to soft failure for unknown errors (err on side of customer)
    return {
      type: 'soft',
      reason: errorCode || declineCode || 'unknown',
      retryable: true,
      shouldReleaseSeats: false,
      description: `Unknown failure: ${error.message || 'No error details'} (defaulting to retryable)`
    };
  }

  // ================================================
  // SPECIFIC CLASSIFICATIONS
  // ================================================

  isFraudRelated(errorCode: string): boolean {
    const fraudCodes = ['fraudulent', 'stolen_card', 'lost_card', 'pickup_card', 'security_violation'];
    return fraudCodes.includes(errorCode);
  }

  isCardIssue(errorCode: string): boolean {
    const cardCodes = ['card_declined', 'expired_card', 'incorrect_cvc', 'invalid_cvc'];
    return cardCodes.includes(errorCode);
  }

  isInsufficientFunds(errorCode: string): boolean {
    return errorCode === 'insufficient_funds';
  }

  isProcessingError(errorCode: string): boolean {
    const processingCodes = ['processing_error', 'issuer_not_available', 'try_again_later'];
    return processingCodes.includes(errorCode);
  }

  // ================================================
  // CLASSIFICATION HELPERS
  // ================================================

  isRetryableError(errorCode: string, declineCode?: string): boolean {
    return STRIPE_ERROR_CODES.RETRYABLE.has(errorCode) || 
           (declineCode ? STRIPE_ERROR_CODES.RETRYABLE_DECLINE.has(declineCode) : false);
  }

  isHardFailureError(errorCode: string): boolean {
    return STRIPE_ERROR_CODES.HARD_FAILURE.has(errorCode);
  }

  getErrorCategory(errorCode: string): 'fraud' | 'card' | 'funds' | 'processing' | 'other' {
    if (this.isFraudRelated(errorCode)) return 'fraud';
    if (this.isCardIssue(errorCode)) return 'card';
    if (this.isInsufficientFunds(errorCode)) return 'funds';
    if (this.isProcessingError(errorCode)) return 'processing';
    return 'other';
  }

  shouldReleaseSeatsForError(classification: FailureClassification): boolean {
    // Hard failures always release seats
    if (classification.type === 'hard') return true;
    
    // Soft failures generally don't release seats, but some exceptions
    // For now, follow the classification's recommendation
    return classification.shouldReleaseSeats;
  }
}

// ================================================
// FACTORY FUNCTION
// ================================================

export function createStripeErrorClassifier(): StripeErrorClassifier {
  return new StripeErrorClassifier();
}

// LOC: 143 lines - under 150 ✅