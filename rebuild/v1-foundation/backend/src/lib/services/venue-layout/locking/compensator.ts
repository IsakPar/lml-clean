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
      const [next, keys] = await redis.scan(cursor, { MATCH: 'lml:lock:seat:*', COUNT: scanCount });
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
        const ttl = Number(ttls?.[i]);
        if (!Number.isFinite(ttl) || ttl <= 0) {
          delPipe.del(key);
          scheduled++;
        }
      });
      if (scheduled > 0) {
        const res = await delPipe.exec();
        deleted += res?.filter((x) => x === 1 || x?.[1] === 1).length ?? 0;
        // Rate limit
        await sleep(Math.ceil((scheduled / perSecond) * 1000));
      }
    } while (cursor !== '0');
  } finally {
    await redis.quit();
  }
  return deleted;
}

export function startLockCompensator(intervalMs: number = 300000) {
  runLockCompensatorOnce().catch(() => {});
  return setInterval(() => runLockCompensatorOnce().catch(() => {}), intervalMs);
}


