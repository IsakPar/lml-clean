/**
 * Stripe Services - Legacy + New Config Exports
 * =============================================
 * 
 * Re-exports from legacy/ to keep existing system working
 * while we build the new Redis Gold Standard structure
 * 
 * ✅ Phase A1 Complete: Config layer extracted and tested
 */

// ================================================
// NEW CONFIG EXPORTS (✅ Ready for production)
// ================================================

export * from './config/constants';
export * from './config/fsm-rules';

// ================================================
// NEW UTILS EXPORTS (✅ Ready for production)
// ================================================

export * from './utils/state-validator';
export * from './utils/error-classifier';

// ================================================
// LEGACY EXPORTS (keep existing system working)
// ================================================

// Export classes and functions from legacy files (not types to avoid conflicts)
export { 
  PaymentFSMManager, 
  createPaymentFSMManager,
  type FSMTransitionRequest,
  type FSMTransitionResult,
  type BookingRecord,
  type PaymentIntentRecord
} from './legacy/payment-fsm-manager';

export { 
  PaymentIntentSucceededHandler,
  handlePaymentIntentSucceeded 
} from './legacy/payment-intent-succeeded';

export { 
  PaymentIntentFailedHandler,
  handlePaymentIntentFailed 
} from './legacy/payment-intent-failed';

export { 
  StripeEventDeduplicator,
  createStripeEventDeduplicator,
  type WebhookEventRecord 
} from './legacy/event-deduplicator';

export { 
  StripeIdempotencyManager,
  createStripeIdempotencyManager,
  type IdempotencyResult 
} from './legacy/idempotency-manager';

// ================================================
// TODO: New modular exports (Phase A2+)
// ================================================

// export * from './operations/payment-ops';
// export * from './operations/fsm-transitions';
// export * from './operations/seat-lock-ops';
// export * from './utils/state-validator';
// export * from './utils/error-classifier';