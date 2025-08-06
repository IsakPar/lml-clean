/**
 * Stripe Service Constants
 * ========================
 * 
 * All constants and configuration for Stripe operations
 * Following Redis Gold Standard: single concern, <150 LOC
 * 
 * ✅ Extracted from legacy files: idempotency-manager.ts, event-deduplicator.ts, 
 *    payment-fsm-manager.ts, payment-intent-failed.ts
 */

// ================================================
// WEBHOOK CONFIGURATION
// ================================================

export const WEBHOOK_CONFIG = {
  // Timeouts and limits
  TIMEOUT_SECONDS: 300, // 5 minutes max age
  MAX_PAYLOAD_SIZE: 1024 * 1024, // 1MB max
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE_MS: 1000,
  RETRY_DELAY_MAX_MS: 30000,
  
  // Rate limiting
  MAX_WEBHOOKS_PER_MINUTE: 1000,
} as const;

// ================================================
// IDEMPOTENCY CONFIGURATION (from legacy/idempotency-manager.ts)
// ================================================

export const IDEMPOTENCY_CONFIG = {
  // TTL settings
  IDEMPOTENCY_TTL_SECONDS: 86400, // 24 hours
  PROCESSING_LOCK_TTL_SECONDS: 300, // 5 minutes max processing time
  
  // Key prefixes  
  KEY_PREFIX: 'stripe_idempotency',
  LOCK_PREFIX: 'stripe_processing_lock',
  CACHE_PREFIX: 'stripe_response_cache',
  
  // Limits
  MAX_PAYLOAD_SIZE_FOR_HASH: 1024 * 512, // 512KB max for hashing
  MAX_IDEMPOTENCY_KEYS_PER_HOUR: 10000,
} as const;

// ================================================
// DEDUPLICATION CONFIGURATION (from legacy/event-deduplicator.ts)
// ================================================

export const DEDUPLICATION_CONFIG = {
  // Processing timeouts
  MAX_PROCESSING_TIME_SECONDS: 300, // 5 minutes
  
  // Retry settings
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 100,
} as const;

// ================================================
// FSM CONFIGURATION (from legacy/payment-fsm-manager.ts)
// ================================================

export const FSM_CONFIG = {
  // Transition timeouts
  TRANSITION_TIMEOUT_SECONDS: 60,
  LOCK_TIMEOUT_SECONDS: 60, // FSM lock: 60 second lock
  
  // Retry settings
  MAX_TRANSITION_RETRIES: 3,
  RETRY_DELAY_MS: 100,
  
  // Cache TTL
  TRANSITION_CACHE_TTL_SECONDS: 86400, // 24 hour TTL for transition records
} as const;

// ================================================
// STRIPE ERROR CODES (from legacy/payment-intent-failed.ts)
// ================================================

export const STRIPE_ERROR_CODES = {
  // Retryable error codes (soft failures) - from RETRYABLE_ERROR_CODES
  RETRYABLE: new Set([
    'card_declined',
    'insufficient_funds', 
    'generic_decline',
    'processing_error',
    'issuer_not_available',
    'try_again_later',
    'authentication_required',
  ]),
  
  // Retryable decline codes - from RETRYABLE_DECLINE_CODES  
  RETRYABLE_DECLINE: new Set([
    'insufficient_funds',
    'generic_decline', 
    'try_again_later',
    'processing_error',
  ]),
  
  // Hard failure codes (terminal) - from HARD_FAILURE_CODES
  HARD_FAILURE: new Set([
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
    'invalid_number',
  ]),
} as const;

// ================================================
// SEAT LOCK CONFIGURATION
// ================================================

export const SEAT_LOCK_CONFIG = {
  // Lock settings
  DEFAULT_TTL_SECONDS: 900, // 15 minutes default
  MAX_LOCKS_PER_USER: 10,
  
  // Redis key prefixes
  LOCK_KEY_PREFIX: 'seat_lock',
} as const;

// Target LOC: 120 lines - under 150 ✅