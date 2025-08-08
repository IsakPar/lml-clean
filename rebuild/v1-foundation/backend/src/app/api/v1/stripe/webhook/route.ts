export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '../../../../lib/db/postgres';
import { sql } from 'drizzle-orm';

// Next.js App Router: need raw body
export const config = { api: { bodyParser: false } } as any;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const REPLAY_WINDOW_S = parseInt(process.env.STRIPE_REPLAY_WINDOW_S || '86400');

async function readRawBody(req: NextRequest): Promise<Buffer> {
  const arrayBuffer = await req.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get('stripe-signature') || '';
    const raw = await readRawBody(req);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
    } catch (err) {
      return new NextResponse('signature verification failed', { status: 400 });
    }

    // Persist event (idempotent)
    const evtId = event.id;
    const evtType = event.type;
    const createdMs = (event as any).created ? Number((event as any).created) * 1000 : Date.now();
    const stripeCreatedAt = new Date(createdMs);
    const now = new Date();
    const ageSeconds = Math.floor((now.getTime() - stripeCreatedAt.getTime()) / 1000);

    try {
      await db.execute(sql`
        INSERT INTO stripe_events (event_id, type, livemode, api_version, payload, stripe_created_at)
        VALUES (${evtId}, ${evtType}, ${event.livemode}, ${event.api_version || null}, ${sql.json(event)}, ${stripeCreatedAt})
      `);
    } catch (e: any) {
      // Duplicate insert → ok, return 200; otherwise bubble up
      if (e && (e.code === '23505' || /duplicate key/i.test(String(e.message)))) {
        try { (await import('../../../../lib/services/stripe/webhook-metrics')).recordWebhookDuplicate(evtId); } catch {}
        return NextResponse.json({ ok: true, duplicate: true });
      }
      console.error('stripe_events insert error', e);
      return new NextResponse('db error', { status: 500 });
    }

    // Replay window handling: store but do not enqueue if too old
    const isReplay = ageSeconds > REPLAY_WINDOW_S;
    if (isReplay) {
      try { (await import('../../../../lib/services/stripe/webhook-metrics')).recordWebhookReplay(evtId, ageSeconds); } catch {}
    }

    if (!isReplay) {
      // Enqueue to outbox for worker (no inline FSM)
      await db.execute(sql`
        INSERT INTO outbox_events (type, aggregate_type, aggregate_id, payload)
        VALUES (${evtType}, ${'stripe'}, ${evtId}, ${sql.json({ event_id: evtId })})
      `);
    }

    return NextResponse.json({ ok: true, enqueued: !isReplay, replay: isReplay });
  } catch (error) {
    return new NextResponse('webhook error', { status: 500 });
  }
}


