import { createClient, type RedisClientType } from 'redis';

export interface CompensatorOptions {
  scanCount?: number;
  intervalMs?: number;
  rateLimitPerSecond?: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runLockCompensatorOnce(opts: CompensatorOptions = {}): Promise<number> {
  const scanCount = opts.scanCount ?? 200;
  const perSecond = opts.rateLimitPerSecond ?? 200;
  const redis: RedisClientType = createClient({ url: process.env.REDIS_URL, database: 3 });
  await redis.connect();
  let cursor = '0';
  let deleted = 0;
  try {
    do {
      const prefix = process.env.LML_LOCK_PREFIX || 'lml';
      const [next, keys] = await redis.scan(cursor, { MATCH: `${prefix}:lock:seat:*`, COUNT: scanCount });
      cursor = next;
      if (keys.length === 0) continue;
      const pipe = redis.multi();
      for (const key of keys) {
        pipe.pTTL(key);
      }
      const ttls = await pipe.exec();
      const delPipe = redis.multi();
      let scheduled = 0;
      keys.forEach((key, i) => {
        const tuple = ttls?.[i];
        const ttl = Number(Array.isArray(tuple) ? tuple[1] : tuple);
        // PTTL: -2 (no key), -1 (no TTL)
        if (!Number.isFinite(ttl) || ttl <= 0) {
          delPipe.del(key);
          scheduled++;
        }
      });
      if (scheduled > 0) {
        const res = await delPipe.exec();
        deleted += res?.filter((x) => (Array.isArray(x) ? x[1] : x) === 1).length ?? 0;
        // Rate limit
        await sleep(Math.max(5, Math.ceil((scheduled / perSecond) * 1000)));
      }
    } while (cursor !== '0');
  } finally {
    await redis.quit();
  }
  return deleted;
}

export function startLockCompensator(intervalMs: number = 300000) {
  if (process.env.FEATURE_FENCED_LOCKS !== 'true') return null;
  const prefix = process.env.LML_LOCK_PREFIX || 'lml';
  console.log(`🧹 Lock compensator enabled (prefix=${prefix}, interval=${intervalMs}ms)`);
  runLockCompensatorOnce().catch((e) => console.warn('Compensator boot run error', e));
  return setInterval(() => runLockCompensatorOnce().catch((e) => console.warn('Compensator tick error', e)), intervalMs);
}


