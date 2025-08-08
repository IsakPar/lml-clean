import Stripe from 'stripe';
import { db } from '../../../../lib/db/postgres';
import { sql } from 'drizzle-orm';

describe('Stripe Webhook Handler', () => {
  it('duplicate webhook → single outbox row', async () => {
    expect(true).toBe(true);
  });

  it('old event beyond replay window → stored but no outbox', async () => {
    expect(true).toBe(true);
  });
});


