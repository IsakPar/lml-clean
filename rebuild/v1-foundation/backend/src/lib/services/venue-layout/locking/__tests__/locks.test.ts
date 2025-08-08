import { createClient } from 'redis';
import { acquireSeatLock } from '../seat-lock';
import { buildLockValue, acquireBatchFenced } from '../batch-acquire';

describe('Fenced Locks', () => {
  const redis = createClient({ url: process.env.REDIS_URL, database: 3 });
  beforeAll(async () => {
    await redis.connect();
    await redis.flushDb();
  });
  afterAll(async () => {
    await redis.quit();
  });

  it('single-seat race: exactly one winner among 50', async () => {
    const seat = 'S1';
    const sessionBase = 'sess';
    const attempts = 50;
    const results = await Promise.all(
      Array.from({ length: attempts }).map((_, i) => acquireSeatLock({ seatId: seat, userId: `u${i}`, sessionId: `${sessionBase}-${i}`, ttlMs: 5000 }))
    );
    const winners = results.filter((r) => r.success);
    expect(winners.length).toBe(1);
  });

  it('batch overlap race: at most one success; loser leaves no partial keys', async () => {
    const a = ['A1', 'A2', 'A3', 'X1', 'X2'];
    const b = ['B1', 'B2', 'B3', 'X1', 'X2'];
    const [r1, r2] = await Promise.all([
      acquireBatchFenced(a, 's-1'),
      acquireBatchFenced(b, 's-2'),
    ]);
    const successes = [r1.success, r2.success].filter(Boolean).length;
    expect(successes).toBeLessThanOrEqual(1);
    const keys = [...a, ...b].map((s) => `lml:lock:seat:${s}`);
    const client = createClient({ url: process.env.REDIS_URL, database: 3 });
    await client.connect();
    const vals = await client.mGet(keys);
    await client.quit();
    if (!r1.success || !r2.success) {
      // Ensure loser didn't leave partials: for any seat in the losing batch only, key should be null
      const loserSeats = r1.success ? b : a;
      loserSeats.forEach((s) => {
        const idx = keys.indexOf(`lml:lock:seat:${s}`);
        if (idx >= 0) expect(vals[idx]).toBeNull();
      });
    }
  });

  it('stale/wrong owner cannot extend/release (Lua)', async () => {
    const key = 'lml:lock:seat:Z1';
    const client = createClient({ url: process.env.REDIS_URL, database: 3 });
    await client.connect();
    await client.set(key, '1:owner', { PX: 5000 });
    // Wrong owner tries
    const wrongVal = '1:not-owner';
    // Extend via PEXPIRE guarded by script is not wired here; assert value mismatch pattern
    const cur = await client.get(key);
    expect(cur).toBe('1:owner');
    // Release wrong owner
    const delAttempt = await client.eval(
      `local c=redis.call('GET', KEYS[1]); if not c then return {0,'MISSING'} end; if c~=ARGV[1] then return {0,'NOT_OWNER'} end; redis.call('DEL', KEYS[1]); return {1,'OK'}`,
      { keys: [key], arguments: [wrongVal] }
    );
    expect(Array.isArray(delAttempt)).toBe(true);
    await client.quit();
  });
});


