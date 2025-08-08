import { createClient, type RedisClientType } from 'redis';
import { db } from '../../../db/postgres';
import { sql } from 'drizzle-orm';
import { getLockSettings } from '../../../config';

function key(seatId: string) { return `lml:lock:seat:${seatId}`; }

export async function bumpAndAcquireSingle(
  seatId: string,
  sessionId: string
): Promise<{ success: boolean; version?: number; expiresAt?: Date }>{
  let version = 0;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '2s'`);
    await tx.execute(sql`INSERT INTO seat_lock_versions (seat_id, version) VALUES (${seatId}, 0) ON CONFLICT (seat_id) DO NOTHING`);
    const rows = await tx.execute(sql`UPDATE seat_lock_versions SET version = version + 1, updated_at = NOW() WHERE seat_id = ${seatId} RETURNING version`);
    version = Number((rows as any)[0].version);
  });
  const ttl = getLockSettings().ttlSelectingMs;
  const expiresAt = new Date(Date.now() + ttl);
  const redis: RedisClientType = createClient({ url: process.env.REDIS_URL, database: 3 });
  await redis.connect();
  const value = `${version}:${sessionId}`;
  const setRes = await redis.set(key(seatId), value, { NX: true, PX: ttl } as any);
  await redis.quit();
  if (setRes !== 'OK') return { success: false };
  return { success: true, version, expiresAt };
}


