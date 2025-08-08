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
    // Migrations table must exist and be consistent
    await db.execute(sql`CREATE TABLE IF NOT EXISTS _migrations (id SERIAL PRIMARY KEY, filename TEXT UNIQUE NOT NULL, checksum TEXT, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const rows = await db.execute(sql`SELECT COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE checksum IS NULL)::int AS nulls FROM _migrations`);
    const row = (rows as any)[0];
    const hasApplied = row && row.cnt >= 1 && row.nulls === 0;
    // Fully up-to-date: ensure there are no known migration files missing from the table
    // Simple heuristic: if at least one applied, consider ok for PR1; PR6 will compare directory/file list in process.
    migrationsUpToDate = !!hasApplied;
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


