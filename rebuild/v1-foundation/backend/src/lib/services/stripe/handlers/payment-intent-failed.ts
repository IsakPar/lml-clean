/**
 * Payment Intent Failed Handler
 * =============================
 * 
 * Processes Stripe payment_intent.payment_failed webhooks
 * - Handles soft failures (keep booking, allow retry)
 * - Handles hard failures (expire booking, release seats)
 * - Releases seat locks appropriately based on failure type
 * - Logs failure reasons for analytics and fraud detection
 * 
 * Uses PaymentFSMManager for atomic state transitions
 * Addresses feedback: "soft vs hard failure distinction is critical"
 */

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import Stripe from 'stripe';
import { z } from 'zod';
import { createPaymentFSMManager, type FSMTransitionRequest, type BookingStatus, type PaymentStatus } from './payment-fsm-manager';

// ================================================
// VALIDATION SCHEMAS
// ================================================

const paymentIntentFailedSchema = z.object({
  id: z.string().startsWith('evt_'),
  type: z.literal('payment_intent.payment_failed'),
  data: z.object({
    object: z.object({
      id: z.string().startsWith('pi_'),
      amount: z.number().positive(),
      currency: z.string().length(3),
      status: z.enum(['requires_payment_method', 'canceled']),
      last_payment_error: z.object({
        code: z.string().optional(),
        decline_code: z.string().optional(),
        message: z.string().optional(),
        payment_method: z.object({
          id: z.string(),
          type: z.string(),
        }).optional(),
        type: z.string(),
      }).optional(),
      metadata: z.record(z.string()).optional(),
    })
  })
});

// ================================================
// FAILURE CLASSIFICATION
// ================================================

interface FailureClassification {
  type: 'soft' | 'hard';
  reason: string;
  retryable: boolean;
  shouldReleaseSeats: boolean;
  description: string;
}

// Stripe error codes that allow retry (soft failures)
const RETRYABLE_ERROR_CODES = new Set([
  'card_declined',
  'insufficient_funds',
  'generic_decline',
  'processing_error',
  'issuer_not_available',
  'try_again_later',
  'authentication_required',
]);

// Stripe decline codes that allow retry
const RETRYABLE_DECLINE_CODES = new Set([
  'insufficient_funds',
  'generic_decline',
  'try_again_later',
  'processing_error',
]);

// Error codes that indicate fraud or should immediately fail
const HARD_FAILURE_CODES = new Set([
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
]);

// ================================================
// PAYMENT FAILURE HANDLER
// ================================================

export class PaymentIntentFailedHandler {
  private postgres: Pool;
  private redis: Redis;
  private fsmManager: ReturnType<typeof createPaymentFSMManager>;

  constructor(postgres: Pool, redis: Redis) {
    this.postgres = postgres;
    this.redis = redis;
    this.fsmManager = createPaymentFSMManager(postgres, redis);
  }

  // ================================================
  // PUBLIC METHODS
  // ================================================

  /**
   * Process payment_intent.payment_failed webhook event
   */
  async handle(event: any): Promise<{ success: boolean; message?: string }> {
    try {
      // 1. Validate event structure
      const validatedEvent = paymentIntentFailedSchema.parse(event);
      const paymentIntent = validatedEvent.data.object;

      console.log(`💥 Processing payment_intent.payment_failed: ${paymentIntent.id}`);

      // 2. Find booking associated with this payment intent
      const booking = await this.findBookingByPaymentIntent(paymentIntent.id);
      if (!booking) {
        console.log(`⚠️ No booking found for failed payment intent: ${paymentIntent.id}`);
        return { 
          success: true, 
          message: 'No booking found - likely test payment or external payment' 
        };
      }

      console.log(`📝 Found booking: ${booking.id} (status: ${booking.status})`);

      // 3. Classify the failure type
      const failureClassification = this.classifyFailure(paymentIntent);
      console.log(`🔍 Failure classification: ${failureClassification.type} - ${failureClassification.reason}`);

      // 4. Log the failure for analytics and fraud detection
      await this.logPaymentFailure(booking, paymentIntent, failureClassification);

      // 5. Determine target booking status based on failure type
      const { targetBookingStatus, targetPaymentStatus } = this.determineTargetStates(
        booking.status,
        failureClassification
      );

      // 6. Build FSM transition request
      const transitionRequest: FSMTransitionRequest = {
        bookingId: booking.id,
        stripeEventId: validatedEvent.id,
        stripeEventType: validatedEvent.type,
        targetBookingStatus,
        targetPaymentStatus,
        stripePaymentIntentId: paymentIntent.id,
        paymentData: {
          amountCents: paymentIntent.amount,
          currency: paymentIntent.currency.toUpperCase(),
          stripeStatus: paymentIntent.status,
        },
        metadata: {
          stripeEventId: validatedEvent.id,
          failureType: failureClassification.type,
          failureReason: failureClassification.reason,
          retryable: failureClassification.retryable,
          shouldReleaseSeats: failureClassification.shouldReleaseSeats,
          processedAt: new Date().toISOString(),
        }
      };

      // 7. Execute atomic FSM transition
      const transitionResult = await this.fsmManager.executeTransition(transitionRequest);

      if (!transitionResult.success) {
        console.error(`❌ FSM transition failed: ${transitionResult.errorMessage}`);
        return {
          success: false,
          message: `FSM transition failed: ${transitionResult.errorMessage}`
        };
      }

      // 8. Handle seat lock release if needed
      if (failureClassification.shouldReleaseSeats && booking.seatIds.length > 0) {
        const locksReleased = await this.releaseSeatLocks(booking.seatIds, booking.userId);
        console.log(`🔓 Seat locks released: ${locksReleased ? 'success' : 'failed'}`);
      }

      console.log(`✅ Payment failure processed: ${booking.id} (${transitionResult.fromBookingStatus} → ${transitionResult.toBookingStatus})`);

      // 9. Trigger post-failure workflows (async)
      this.triggerPostFailureWorkflows(booking, paymentIntent, failureClassification)
        .catch(error => {
          console.error('❌ Post-failure workflow error:', error);
          // Non-critical - don't fail the main flow
        });

      return {
        success: true,
        message: `Payment failure processed for booking ${booking.id} (${failureClassification.type} failure)`
      };

    } catch (error) {
      console.error('❌ Payment intent failed handler error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // ================================================
  // PRIVATE METHODS
  // ================================================

  /**
   * Find booking by Stripe payment intent ID
   */
  private async findBookingByPaymentIntent(paymentIntentId: string): Promise<{
    id: string;
    userId: string;
    eventId: string;
    status: string;
    totalAmountCents: number;
    seatIds: string[];
  } | null> {
    const client = await this.postgres.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          b.id, b.user_id, b.event_id, b.status, 
          b.total_amount_cents, b.seat_ids
        FROM bookings b
        LEFT JOIN payment_intents pi ON pi.booking_id = b.id
        WHERE b.stripe_payment_intent_id = $1 
           OR pi.stripe_payment_intent_id = $1
        ORDER BY b.created_at DESC
        LIMIT 1
      `, [paymentIntentId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        eventId: row.event_id,
        status: row.status,
        totalAmountCents: row.total_amount_cents,
        seatIds: row.seat_ids || [],
      };

    } finally {
      client.release();
    }
  }

  /**
   * Classify payment failure as soft (retryable) or hard (terminal)
   */
  private classifyFailure(paymentIntent: any): FailureClassification {
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

    const errorCode = error.code;
    const declineCode = error.decline_code;

    // Check for hard failure codes first (security/fraud)
    if (errorCode && HARD_FAILURE_CODES.has(errorCode)) {
      return {
        type: 'hard',
        reason: errorCode,
        retryable: false,
        shouldReleaseSeats: true,
        description: `Hard failure: ${error.message || errorCode}`
      };
    }

    // Check for retryable error codes
    if (errorCode && RETRYABLE_ERROR_CODES.has(errorCode)) {
      return {
        type: 'soft',
        reason: errorCode,
        retryable: true,
        shouldReleaseSeats: false,
        description: `Soft failure: ${error.message || errorCode} (retryable)`
      };
    }

    // Check decline codes
    if (declineCode && RETRYABLE_DECLINE_CODES.has(declineCode)) {
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

  /**
   * Determine target FSM states based on failure classification
   */
  private determineTargetStates(
    currentBookingStatus: string,
    classification: FailureClassification
  ): { targetBookingStatus: BookingStatus; targetPaymentStatus: PaymentStatus } {
    if (classification.type === 'hard') {
      // Hard failures: expire the booking
      return {
        targetBookingStatus: 'expired',
        targetPaymentStatus: 'failed'
      };
    } else {
      // Soft failures: keep booking active for retry
      return {
        targetBookingStatus: currentBookingStatus as BookingStatus, // Keep current status
        targetPaymentStatus: 'failed'
      };
    }
  }

  /**
   * Log payment failure for analytics and fraud detection
   */
  private async logPaymentFailure(
    booking: any,
    paymentIntent: any,
    classification: FailureClassification
  ): Promise<void> {
    try {
      const client = await this.postgres.connect();
      
      try {
        await client.query(`
          INSERT INTO payment_failures (
            booking_id, stripe_payment_intent_id, failure_type, 
            failure_reason, error_code, decline_code, error_message,
            retryable, seats_released, amount_cents, currency,
            failure_metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        `, [
          booking.id,
          paymentIntent.id,
          classification.type,
          classification.reason,
          paymentIntent.last_payment_error?.code,
          paymentIntent.last_payment_error?.decline_code,
          paymentIntent.last_payment_error?.message,
          classification.retryable,
          classification.shouldReleaseSeats,
          paymentIntent.amount,
          paymentIntent.currency,
          JSON.stringify({
            classification,
            paymentIntentStatus: paymentIntent.status,
            lastPaymentError: paymentIntent.last_payment_error,
          })
        ]);

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Failed to log payment failure:', error);
      // Non-critical error
    }
  }

  /**
   * Release seat locks for hard failures
   */
  private async releaseSeatLocks(seatIds: string[], userId: string): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const seatId of seatIds) {
        const lockKey = `seat_lock:${seatId}`;
        // Use Lua script to ensure atomic lock release with ownership check
        pipeline.eval(`
          local key = KEYS[1]
          local expected_user = ARGV[1]
          local current_lock = redis.call('GET', key)
          if current_lock and current_lock == expected_user then
            redis.call('DEL', key)
            return 1
          end
          return 0
        `, 1, lockKey, userId);
      }
      
      const results = await pipeline.exec();
      const allReleased = results?.every(result => result[1] === 1) || false;
      
      // Also trigger cache invalidation for seat availability
      if (allReleased) {
        await this.invalidateSeatCache(seatIds);
      }
      
      return allReleased;
      
    } catch (error) {
      console.error('❌ Failed to release seat locks:', error);
      return false;
    }
  }

  /**
   * Invalidate seat availability cache
   */
  private async invalidateSeatCache(seatIds: string[]): Promise<void> {
    try {
      const cacheKeys = seatIds.map(seatId => `seat_availability:${seatId}`);
      if (cacheKeys.length > 0) {
        await this.redis.del(...cacheKeys);
      }
    } catch (error) {
      console.error('❌ Failed to invalidate seat cache:', error);
      // Non-critical error
    }
  }

  /**
   * Trigger post-failure workflows asynchronously
   */
  private async triggerPostFailureWorkflows(
    booking: any,
    paymentIntent: any,
    classification: FailureClassification
  ): Promise<void> {
    const workflows = [
      this.sendFailureNotification(booking, classification),
      this.updateFraudScore(booking, paymentIntent, classification),
      this.processWaitlistIfSeatsReleased(booking, classification),
      this.recordFailureAnalytics(booking, paymentIntent, classification),
    ];

    // Run workflows in parallel, log errors but don't fail
    const results = await Promise.allSettled(workflows);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`❌ Post-failure workflow ${index} failed:`, result.reason);
      }
    });
  }

  /**
   * Send failure notification to user (async)
   */
  private async sendFailureNotification(booking: any, classification: FailureClassification): Promise<void> {
    if (classification.retryable) {
      console.log(`📧 TODO: Send retry notification for booking ${booking.id}`);
      // TODO: Send email encouraging user to try different payment method
    } else {
      console.log(`📧 TODO: Send failure notification for booking ${booking.id}`);
      // TODO: Send email explaining booking expiration
    }
  }

  /**
   * Update fraud score based on failure patterns (async)
   */
  private async updateFraudScore(booking: any, paymentIntent: any, classification: FailureClassification): Promise<void> {
    if (HARD_FAILURE_CODES.has(classification.reason)) {
      console.log(`🚨 TODO: Update fraud score for user ${booking.userId} (reason: ${classification.reason})`);
      // TODO: Update fraud scoring system, potentially flag user/IP
    }
  }

  /**
   * Process waitlist if seats were released (async)
   */
  private async processWaitlistIfSeatsReleased(booking: any, classification: FailureClassification): Promise<void> {
    if (classification.shouldReleaseSeats && booking.seatIds.length > 0) {
      console.log(`📋 TODO: Process waitlist for released seats: ${booking.seatIds.join(', ')}`);
      // TODO: Notify waitlisted users that seats are available
    }
  }

  /**
   * Record failure analytics (async)
   */
  private async recordFailureAnalytics(booking: any, paymentIntent: any, classification: FailureClassification): Promise<void> {
    console.log(`📈 TODO: Record failure analytics for booking ${booking.id}`);
    // TODO: Send to analytics service (failure rates, common decline reasons, etc.)
  }
}

// ================================================
// FACTORY FUNCTION
// ================================================

/**
 * Create payment intent failed handler
 */
export function createPaymentIntentFailedHandler(
  postgres: Pool,
  redis: Redis
): PaymentIntentFailedHandler {
  return new PaymentIntentFailedHandler(postgres, redis);
}

// ================================================
// MAIN HANDLER FUNCTION
// ================================================

/**
 * Main handler function for webhook routing
 */
export async function handlePaymentIntentFailed(
  event: any,
  postgres: Pool,
  redis: Redis
): Promise<{ success: boolean; message?: string }> {
  const handler = createPaymentIntentFailedHandler(postgres, redis);
  return await handler.handle(event);
}