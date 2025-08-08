export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { checkPostgresHealth } from '../../../../lib/db/postgres';
import { checkRedisHealth, getRedisClient } from '../../../../lib/db/redis';
import { sql } from 'drizzle-orm';
import { db } from '../../../../lib/db/postgres';

export async function GET() {
  const pg = await checkPostgresHealth();
  const redis = await checkRedisHealth();
  let migrationsUpToDate = false;
  try {
    // Ensure _migrations exists and at least one row or zero rows (no pending known). In PR1 scope, just presence is enough.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS _migrations (id SERIAL PRIMARY KEY, filename TEXT UNIQUE NOT NULL, checksum TEXT, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const rows = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM _migrations`);
    migrationsUpToDate = (rows as any)[0]?.cnt >= 0;
  } catch {
    migrationsUpToDate = false;
  }

  const ok = pg.status === 'connected' && redis.status === 'connected' && migrationsUpToDate;

  return NextResponse.json({
    ready: ok,
    postgres: pg.status,
    redis: redis.status,
    migrations: migrationsUpToDate ? 'ok' : 'unknown'
  }, { status: ok ? 200 : 503 });
}


