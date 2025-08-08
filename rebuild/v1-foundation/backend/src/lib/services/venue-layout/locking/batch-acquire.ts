import { createClient, type RedisClientType } from 'redis';
import { sql } from 'drizzle-orm';
import { db } from '../../../db/postgres';
import { getLockSettings } from '../../../config';
import { recordBatchSize, recordLockFailure } from './lock-metrics';

function buildLockKey(seatId: string): string {
  const prefix = process.env.LML_LOCK_PREFIX || 'lml';
  return `${prefix}:lock:seat:${seatId}`;
}

export function buildLockValue(version: number, sessionId: string): string {
  if (!Number.isFinite(version) || version < 0) throw new Error('Invalid version');
  if (!sessionId || sessionId.length < 3) throw new Error('Invalid sessionId');
  return `${version}:${sessionId}`;
}

export async function acquireBatchFenced(
  seatIds: string[],
  sessionId: string
): Promise<{ success: boolean; locks?: { seatId: string; version: number; expiresAt: Date }[]; error?: string }> {
  const maxTtl = getLockSettings().maxTtlMs;
  const ttlMs = getLockSettings().ttlSelectingMs;
  recordBatchSize(seatIds.length);

  // 1) Monotonic bump and fetch versions inside a single transaction for all seats (two statements)
  const versions: Record<string, number> = {};
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '2s'`);
    // Insert missing rows in one statement
    const insertValues = sql.join(seatIds.map((id) => sql`(${id}, 0)`), sql`, `);
    await tx.execute(sql`INSERT INTO seat_lock_versions (seat_id, version) VALUES ${insertValues} ON CONFLICT (seat_id) DO NOTHING`);
    // Bump all in one update using VALUES list
    const valueList = sql.join(seatIds.map((id) => sql`(${id})`), sql`, `);
    const bumped = await tx.execute(sql`
      UPDATE seat_lock_versions v
      SET version = v.version + 1, updated_at = NOW()
      FROM (VALUES ${valueList}) AS s(seat_id)
      WHERE v.seat_id = s.seat_id
      RETURNING v.seat_id, v.version
    `);
    for (const row of bumped as any[]) {
      versions[row.seat_id] = Number(row.version);
    }
  });

  // 2) Pipeline SET NX PX for all seats
  const redis: RedisClientType = createClient({ url: process.env.REDIS_URL, database: 3 });
  await redis.connect();
  const pipeline = redis.multi();
  const now = Date.now();
  const expiresAt = new Date(now + ttlMs);

  const keys: string[] = [];
  const values: string[] = [];
  for (const seatId of seatIds) {
    const key = buildLockKey(seatId);
    const value = buildLockValue(versions[seatId], sessionId);
    keys.push(key);
    values.push(value);
    // @ts-expect-error redis v4 types
    pipeline.set(key, value, { NX: true, PX: ttlMs });
  }

  const exec = await pipeline.exec();
  const oks = (exec || []).map((tuple: any) => {
    const res = Array.isArray(tuple) ? tuple[1] : tuple;
    return res === 'OK';
  });
  // Safety: ensure arrays align
  if (keys.length !== values.length || keys.length !== seatIds.length) {
    throw new Error('BATCH_ROLLBACK_MISMATCH');
  }
  const allOk = oks.length === seatIds.length && oks.every(Boolean);

  if (!allOk) {
    // Roll back any keys that were set
    const setIndexes = oks.map((ok, i) => (ok ? i : -1)).filter((i) => i >= 0);
    if (setIndexes.length > 0) {
      const KEYS = setIndexes.map((i) => keys[i]);
      const ARGV = setIndexes.map((i) => values[i]);
      const rollbackScript = "local deleted=0 for i=1,#KEYS do local k=KEYS[i] local expected=ARGV[i] local current=redis.call('GET',k) if current and current==expected then redis.call('DEL',k) deleted=deleted+1 end end return deleted";
      await redis.eval(rollbackScript, { keys: KEYS, arguments: ARGV });
    }
    await redis.quit();
    recordLockFailure('batch', 'system', 'partial_failure');
    return { success: false, error: 'BATCH_CONFLICT' };
  }

  await redis.quit();
  return {
    success: true,
    locks: seatIds.map((seatId) => ({ seatId, version: versions[seatId], expiresAt })),
  };
}


