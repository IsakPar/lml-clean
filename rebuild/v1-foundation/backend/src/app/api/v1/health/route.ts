export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { checkPostgresHealth } from '../../../../lib/db/postgres';
import { getConfig, logEnvironmentStatus } from '../../../../lib/env';
import { getFeatureFlags } from '../../../../lib/config';

export async function GET() {
  // Ensure boot line printed once in dev server hot reloads
  if (process.env.__LML_BOOT_LOGGED !== '1') {
    logEnvironmentStatus();
    process.env.__LML_BOOT_LOGGED = '1';
  }

  const pg = await checkPostgresHealth();
  const ok = pg.status === 'connected';

  const flags = getFeatureFlags();

  return NextResponse.json({
    status: ok ? 'ok' : 'degraded',
    postgres: pg,
    env: getConfig().env,
    features: flags,
  }, { status: ok ? 200 : 503 });
}


