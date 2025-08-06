import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import crypto from 'crypto';
import { z } from 'zod';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { createStripeIdempotencyManager } from '../../../../../lib/services/stripe/idempotency-manager';
import { createStripeEventDeduplicator } from '../../../../../lib/services/stripe/event-deduplicator';

/**
 * Stripe Webhook Handler - Production Grade
 * 
 * Handles all Stripe webhook events with:
 * - Signature verification
 * - Idempotency protection  
 * - Event deduplication
 * - FSM state validation
 * - Replay attack protection
 */

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

// Webhook configuration
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const WEBHOOK_TIMEOUT_SECONDS = 300; // 5 minutes max age
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB max

// Global instances (would use DI in production)
let postgres: Pool | null = null;
let redis: Redis | null = null;

async function getConnections() {
  if (!postgres) {
    // Use raw PostgreSQL connection for webhook processing (Drizzle is for app-level queries)
    postgres = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL!);
  }
  return { postgres, redis };
}

// Event validation schema
const stripeEventSchema = z.object({
  id: z.string().startsWith('evt_'),
  object: z.literal('event'),
  type: z.string(),
  livemode: z.boolean(),
  api_version: z.string(),
  created: z.number(),
  data: z.object({
    object: z.record(z.any()),
  }),
  pending_webhooks: z.number(),
  request: z.object({
    id: z.string().nullable(),
    idempotency_key: z.string().nullable(),
  }).nullable(),
});

/**
 * POST /api/v1/payments/webhooks
 * 
 * Primary Stripe webhook endpoint with enterprise-grade security
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // 1. Basic security checks
    const contentLength = parseInt(request.headers.get('content-length') || '0');
    if (contentLength > MAX_PAYLOAD_SIZE) {
      console.error('❌ Stripe webhook failure - payload too large:', { contentLength });
      return NextResponse.json(
        { error: 'Payload too large' }, 
        { status: 413 }
      );
    }

    // 2. Get raw body and signature
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      console.error('❌ Stripe webhook failure - missing signature');
      return NextResponse.json(
        { error: 'Missing signature' }, 
        { status: 400 }
      );
    }

    // 3. Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
    } catch (signatureError) {
      console.error('❌ Stripe webhook failure - invalid signature:', signatureError);
      return NextResponse.json(
        { error: 'Invalid signature' }, 
        { status: 401 }
      );
    }

    // 4. Validate event structure
    const validatedEvent = stripeEventSchema.parse(event);
    
    // 5. Timestamp validation (replay attack protection)
    const eventAge = Date.now() / 1000 - validatedEvent.created;
    if (eventAge > WEBHOOK_TIMEOUT_SECONDS) {
      console.error('❌ Stripe webhook failure - event too old (replay attack):', { 
        eventId: validatedEvent.id, 
        eventType: validatedEvent.type,
        eventAge, 
        maxAge: WEBHOOK_TIMEOUT_SECONDS 
      });
      return NextResponse.json(
        { error: 'Event too old' }, 
        { status: 400 }
      );
    }

    // 6. Initialize idempotency and deduplication services
    const { postgres, redis } = await getConnections();
    const idempotencyManager = createStripeIdempotencyManager(redis);
    const eventDeduplicator = createStripeEventDeduplicator(postgres);
    
    // 7. Check Redis-based idempotency (fast layer)
    const idempotencyResult = await idempotencyManager.checkIdempotencyAndLock(
      validatedEvent.id,
      validatedEvent,
      validatedEvent.created
    );
    
    if (idempotencyResult.isDuplicate) {
      // Redis detected duplicate - return cached response if available
      return NextResponse.json({ 
        received: true, 
        status: 'already_processed',
        source: 'redis_cache',
        existingResponse: idempotencyResult.existingResponse 
      });
    }
    
    if (idempotencyResult.isProcessing) {
      // Event currently being processed
      return NextResponse.json({ 
        received: true, 
        status: 'processing' 
      }, { status: 409 });
    }
    
    if (!idempotencyResult.lockAcquired) {
      // Failed to acquire processing lock
      return NextResponse.json({ 
        received: true, 
        status: 'lock_failed' 
      }, { status: 429 });
    }
    
    // 8. Check PostgreSQL-based deduplication (durable layer)
    const deduplicationResult = await eventDeduplicator.checkAndRegisterEvent({
      stripeEventId: validatedEvent.id,
      eventType: validatedEvent.type,
      livemode: validatedEvent.livemode,
      apiVersion: validatedEvent.api_version,
      idempotencyKey: validatedEvent.request?.idempotency_key || undefined,
      rawPayload: validatedEvent
    });
    
    if (deduplicationResult.isDuplicate) {
      // PostgreSQL detected duplicate - release Redis lock and return
      await idempotencyManager.markProcessingComplete(
        validatedEvent.id,
        idempotencyResult.idempotencyKey
      );
      
      return NextResponse.json({ 
        received: true, 
        status: 'already_processed',
        source: 'postgres_deduplication' 
      });
    }

    // 9. Route to appropriate event handler
    let processingResult: { success: boolean };
    const webhookResponse = { 
      received: true, 
      status: 'processed',
      eventId: validatedEvent.id,
      processingTime: 0
    };
    
    try {
      processingResult = await routeWebhookEvent(validatedEvent);
      
      if (processingResult.success) {
        // Mark as completed in both Redis and PostgreSQL
        await Promise.all([
          idempotencyManager.markProcessingComplete(
            validatedEvent.id,
            idempotencyResult.idempotencyKey,
            webhookResponse
          ),
          eventDeduplicator.updateEventStatus(
            deduplicationResult.recordId!,
            'completed'
          )
        ]);
        
        // Log successful processing
        const processingTime = Date.now() - startTime;
        webhookResponse.processingTime = processingTime;
        console.log(`✅ Webhook processed: ${validatedEvent.type} (${processingTime}ms)`);
        
        return NextResponse.json(webhookResponse);
        
      } else {
        throw new Error('Event handler returned failure');
      }
      
    } catch (processingError) {
      // Mark as failed in both Redis and PostgreSQL
      const error = processingError as Error;
      
      await Promise.all([
        idempotencyManager.markProcessingFailed(
          validatedEvent.id,
          idempotencyResult.idempotencyKey,
          error
        ),
        eventDeduplicator.updateEventStatus(
          deduplicationResult.recordId!,
          'failed',
          error
        )
      ]);
      
      // Re-throw to be caught by outer error handler
      throw error;
    }

  } catch (error) {
    // Critical webhook processing failure
    const processingTime = Date.now() - startTime;
    
    console.error('❌ Stripe webhook processing error:', error, { processingTime });
    
    console.error('❌ Webhook processing error:', error);
    
    return NextResponse.json(
      { 
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : String(error)
      }, 
      { status: 500 }
    );
  }
}

/**
 * Route webhook events to appropriate handlers
 */
async function routeWebhookEvent(event: z.infer<typeof stripeEventSchema>): Promise<{ success: boolean }> {
  console.log(`🔀 Routing webhook event: ${event.type}`);
  
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        return await handlePaymentIntentSucceeded(event);
      
      case 'payment_intent.payment_failed':
        return await handlePaymentIntentFailed(event);
      
      case 'checkout.session.completed':
        return await handleCheckoutSessionCompleted(event);
      
      case 'charge.dispute.created':
        return await handleChargeDispute(event);
      
      case 'invoice.payment_failed':
        return await handleInvoicePaymentFailed(event);
      
      case 'account.updated':
        return await handleAccountUpdated(event);
      
      // Add more event types as needed
      default:
        console.log(`ℹ️ Unhandled webhook event type: ${event.type}`);
        return { success: true }; // Don't fail for unknown events
    }
  } catch (handlerError) {
    console.error('❌ Stripe webhook handler error:', {
      eventId: event.id,
      eventType: event.type,
      error: handlerError,
      eventData: event.data
    });
    return { success: false };
  }
}

/**
 * FSM-integrated event handlers
 */
async function handlePaymentIntentSucceeded(event: any): Promise<{ success: boolean }> {
  const { handlePaymentIntentSucceeded: handler } = await import('../../../../../lib/services/stripe/handlers/payment-intent-succeeded');
  const { postgres, redis } = await getConnections();
  
  try {
    const result = await handler(event, postgres, redis);
    return { success: result.success };
  } catch (error) {
    console.error('❌ Payment intent succeeded handler error:', error);
    return { success: false };
  }
}

async function handlePaymentIntentFailed(event: any): Promise<{ success: boolean }> {
  const { handlePaymentIntentFailed: handler } = await import('../../../../../lib/services/stripe/handlers/payment-intent-failed');
  const { postgres, redis } = await getConnections();
  
  try {
    const result = await handler(event, postgres, redis);
    return { success: result.success };
  } catch (error) {
    console.error('❌ Payment intent failed handler error:', error);
    return { success: false };
  }
}

async function handleCheckoutSessionCompleted(event: any): Promise<{ success: boolean }> {
  console.log('🎯 TODO: Implement checkout.session.completed handler');
  return { success: true };
}

async function handleChargeDispute(event: any): Promise<{ success: boolean }> {
  console.log('🎯 TODO: Implement charge.dispute.created handler');
  return { success: true };
}

async function handleInvoicePaymentFailed(event: any): Promise<{ success: boolean }> {
  console.log('🎯 TODO: Implement invoice.payment_failed handler');
  return { success: true };
}

async function handleAccountUpdated(event: any): Promise<{ success: boolean }> {
  console.log('🎯 TODO: Implement account.updated handler');
  return { success: true };
}