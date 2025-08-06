/**
 * Payment Intent Succeeded Handler
 * ================================
 * 
 * Processes Stripe payment_intent.succeeded webhooks
 * - Transitions booking from 'pending_payment' → 'confirmed'
 * - Updates payment status to 'succeeded'
 * - Releases seat locks (payment complete)
 * - Triggers post-payment workflows (async)
 * 
 * Uses PaymentFSMManager for atomic, idempotent state transitions
 * Addresses feedback: "deduplication with checkout.session.completed must be bulletproof"
 */

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import Stripe from 'stripe';
import { z } from 'zod';
import { createPaymentFSMManager, type FSMTransitionRequest } from './payment-fsm-manager';
import { type BookingStatus, type PaymentStatus } from '../config/fsm-rules';
import { createStateValidator } from '../utils/state-validator';

// ================================================
// VALIDATION SCHEMAS
// ================================================

const paymentIntentSucceededSchema = z.object({
  id: z.string().startsWith('evt_'),
  type: z.literal('payment_intent.succeeded'),
  data: z.object({
    object: z.object({
      id: z.string().startsWith('pi_'),
      amount: z.number().positive(),
      currency: z.string().length(3),
      status: z.literal('succeeded'),
      payment_method: z.string().optional(),
      payment_method_types: z.array(z.string()),
      payment_method_details: z.any().optional(),
      metadata: z.record(z.string()).optional(),
      charges: z.object({
        data: z.array(z.object({
          id: z.string(),
          amount: z.number(),
          status: z.string(),
          payment_method_details: z.any().optional(),
        }))
      }).optional(),
    })
  })
});

// ================================================
// PAYMENT SUCCESS HANDLER
// ================================================

export class PaymentIntentSucceededHandler {
  private postgres: Pool;
  private redis: Redis;
  private fsmManager: ReturnType<typeof createPaymentFSMManager>;
  private stateValidator: ReturnType<typeof createStateValidator>;

  constructor(postgres: Pool, redis: Redis) {
    this.postgres = postgres;
    this.redis = redis;
    this.fsmManager = createPaymentFSMManager(postgres, redis);
    this.stateValidator = createStateValidator();
  }

  // ================================================
  // PUBLIC METHODS
  // ================================================

  /**
   * Process payment_intent.succeeded webhook event
   */
  async handle(event: any): Promise<{ success: boolean; message?: string }> {
    try {
      // 1. Validate event structure
      const validatedEvent = paymentIntentSucceededSchema.parse(event);
      const paymentIntent = validatedEvent.data.object;

      console.log(`🎯 Processing payment_intent.succeeded: ${paymentIntent.id}`);

      // 2. Find booking associated with this payment intent
      const booking = await this.findBookingByPaymentIntent(paymentIntent.id);
      if (!booking) {
        console.log(`⚠️ No booking found for payment intent: ${paymentIntent.id}`);
        return { 
          success: true, 
          message: 'No booking found - likely test payment or external payment' 
        };
      }

      console.log(`📝 Found booking: ${booking.id} (status: ${booking.status})`);

      // 3. Validate booking is in correct state for payment success
      if (!this.isValidBookingStateForPayment(booking.status)) {
        console.log(`❌ Invalid booking state for payment: ${booking.status}`);
        return {
          success: false,
          message: `Booking ${booking.id} is in state '${booking.status}' - cannot process payment success`
        };
      }

      // 4. Extract payment data for FSM transition
      const paymentData = this.extractPaymentData(paymentIntent);

      // 5. Build FSM transition request
      const transitionRequest: FSMTransitionRequest = {
        bookingId: booking.id,
        stripeEventId: validatedEvent.id,
        stripeEventType: validatedEvent.type,
        targetBookingStatus: 'confirmed',
        targetPaymentStatus: 'succeeded',
        stripePaymentIntentId: paymentIntent.id,
        paymentData,
        metadata: {
          stripeEventId: validatedEvent.id,
          paymentMethodTypes: paymentIntent.payment_method_types,
          processedAt: new Date().toISOString(),
        }
      };

      // 6. Execute atomic FSM transition via PaymentFSMManager
      const transitionResult = await this.fsmManager.executeTransition(transitionRequest);

      if (!transitionResult.success) {
        console.error(`❌ FSM transition failed: ${transitionResult.errorMessage}`);
        
        // Check if rollback is required
        if (transitionResult.rollbackRequired) {
          await this.scheduleRollback(booking.id, validatedEvent.id);
        }

        return {
          success: false,
          message: `FSM transition failed: ${transitionResult.errorMessage}`
        };
      }

      console.log(`✅ Payment success processed: ${booking.id} (${transitionResult.fromBookingStatus} → ${transitionResult.toBookingStatus})`);

      // 7. Trigger async post-payment workflows (non-blocking)
      this.triggerPostPaymentWorkflows(booking, paymentIntent, transitionResult)
        .catch(error => {
          console.error('❌ Post-payment workflow error:', error);
          // Non-critical - don't fail the main flow
        });

      return {
        success: true,
        message: `Payment successfully processed for booking ${booking.id}`
      };

    } catch (error) {
      console.error('❌ Payment intent succeeded handler error:', error);
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
   * Check if booking is in valid state to process payment success
   * ✅ Now using new StateValidator utils with fallback to legacy behavior
   */
  private isValidBookingStateForPayment(bookingStatus: string): boolean {
    try {
      // Use new StateValidator for enhanced validation
      const result = this.stateValidator.validateBookingStateForPayment(bookingStatus as BookingStatus);
      return result.isValid;
    } catch (newValidatorError) {
      // Fallback to legacy validation to ensure exact same behavior
      console.warn('🔄 State validator error, falling back to legacy validation:', newValidatorError);
      
      // Legacy validation (preserved for compatibility)
      const validStates = [
        'pending_payment',  // Normal flow
        'partially_paid',   // Installment payments
        'fraud_hold'        // Cleared from fraud review
      ];
      
      return validStates.includes(bookingStatus);
    }
  }

  /**
   * Extract payment data from Stripe payment intent
   */
  private extractPaymentData(paymentIntent: any) {
    // Get payment method details from charges if available
    const charge = paymentIntent.charges?.data?.[0];
    const paymentMethodDetails = charge?.payment_method_details || paymentIntent.payment_method_details;

    return {
      amountCents: paymentIntent.amount,
      currency: paymentIntent.currency.toUpperCase(),
      stripeStatus: paymentIntent.status,
      paymentMethodType: paymentIntent.payment_method_types?.[0] || 'unknown',
      paymentMethodDetails: paymentMethodDetails ? {
        type: paymentMethodDetails.type,
        brand: paymentMethodDetails.card?.brand,
        lastFour: paymentMethodDetails.card?.last4,
        expMonth: paymentMethodDetails.card?.exp_month,
        expYear: paymentMethodDetails.card?.exp_year,
        country: paymentMethodDetails.card?.country,
        funding: paymentMethodDetails.card?.funding,
        wallet: paymentMethodDetails.card?.wallet?.type,
      } : null,
    };
  }

  /**
   * Schedule rollback for failed transition (stored in recovery table)
   */
  private async scheduleRollback(bookingId: string, stripeEventId: string): Promise<void> {
    try {
      const client = await this.postgres.connect();
      
      try {
        await client.query(`
          INSERT INTO payment_failures (
            booking_id, stripe_event_id, failure_type, 
            recovery_required, scheduled_at, metadata
          ) VALUES ($1, $2, $3, $4, NOW(), $5)
          ON CONFLICT (booking_id, stripe_event_id) DO NOTHING
        `, [
          bookingId,
          stripeEventId,
          'fsm_transition_failed',
          true,
          JSON.stringify({ 
            reason: 'FSM transition rollback required',
            handler: 'payment_intent.succeeded' 
          })
        ]);

        console.log(`📝 Rollback scheduled for booking: ${bookingId}`);

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Failed to schedule rollback:', error);
      // Non-critical error
    }
  }

  /**
   * Trigger post-payment workflows asynchronously
   */
  private async triggerPostPaymentWorkflows(
    booking: any,
    paymentIntent: any,
    transitionResult: any
  ): Promise<void> {
    // These workflows run async to keep webhook response time low
    const workflows = [
      this.sendConfirmationEmail(booking, paymentIntent),
      this.generateTickets(booking),
      this.updateInventoryCounters(booking.eventId, booking.seatIds),
      this.recordAnalyticsEvent(booking, paymentIntent),
      this.updateVenuePayoutCalculation(booking),
    ];

    // Run workflows in parallel, log errors but don't fail
    const results = await Promise.allSettled(workflows);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`❌ Post-payment workflow ${index} failed:`, result.reason);
      }
    });
  }

  /**
   * Send booking confirmation email (async)
   */
  private async sendConfirmationEmail(booking: any, paymentIntent: any): Promise<void> {
    console.log(`📧 TODO: Send confirmation email for booking ${booking.id}`);
    // TODO: Integrate with email service
    // This would typically queue an email job or call an email service
  }

  /**
   * Generate digital tickets (async)
   */
  private async generateTickets(booking: any): Promise<void> {
    console.log(`🎫 TODO: Generate tickets for booking ${booking.id}`);
    // TODO: Generate ticket PDFs/QR codes and store in ticket_assets table
  }

  /**
   * Update inventory counters (async)
   */
  private async updateInventoryCounters(eventId: string, seatIds: string[]): Promise<void> {
    console.log(`📊 TODO: Update inventory for event ${eventId}, seats: ${seatIds.join(', ')}`);
    // TODO: Update event availability counters, waitlist processing, etc.
  }

  /**
   * Record analytics event (async)
   */
  private async recordAnalyticsEvent(booking: any, paymentIntent: any): Promise<void> {
    console.log(`📈 TODO: Record analytics for booking ${booking.id}`);
    // TODO: Send to analytics service (Mixpanel, Segment, etc.)
  }

  /**
   * Update venue payout calculation (async)
   */
  private async updateVenuePayoutCalculation(booking: any): Promise<void> {
    console.log(`💰 TODO: Update venue payout for booking ${booking.id}`);
    // TODO: Calculate venue commission, update payout schedules
  }
}

// ================================================
// FACTORY FUNCTION
// ================================================

/**
 * Create payment intent succeeded handler
 */
export function createPaymentIntentSucceededHandler(
  postgres: Pool,
  redis: Redis
): PaymentIntentSucceededHandler {
  return new PaymentIntentSucceededHandler(postgres, redis);
}

// ================================================
// MAIN HANDLER FUNCTION
// ================================================

/**
 * Main handler function for webhook routing
 */
export async function handlePaymentIntentSucceeded(
  event: any,
  postgres: Pool,
  redis: Redis
): Promise<{ success: boolean; message?: string }> {
  const handler = createPaymentIntentSucceededHandler(postgres, redis);
  return await handler.handle(event);
}