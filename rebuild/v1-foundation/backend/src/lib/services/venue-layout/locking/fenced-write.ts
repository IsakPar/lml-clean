import { db } from '../../../db/postgres';
import { sql } from 'drizzle-orm';
import { recordOrdersTxnLockWaitMs } from './lock-metrics';

export class StaleLockError extends Error {
  constructor(message = 'STALE_LOCK') {
    super(message);
    this.name = 'StaleLockError';
  }
}

/**
 * Execute a write guarded by a fenced seat lock version equality check.
 * - Sets short lock and statement timeouts
 * - SELECT ... FOR UPDATE the seat_lock_versions row
 * - Enforces strict equality: current_version === providedVersion
 * - Throws StaleLockError on missing row or mismatch
 */
export async function withFencedSeatWrite<T>(
  seatId: string,
  providedVersion: number,
  write: (tx: typeof db) => Promise<T>
): Promise<T> {
  const txnStart = Date.now();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '2s'`);

    const lockWaitStart = Date.now();
    const rows = await tx.execute(sql`
      SELECT version
      FROM seat_lock_versions
      WHERE seat_id = ${seatId}
      FOR UPDATE
    `);
    const lockWait = Date.now() - lockWaitStart;
    recordOrdersTxnLockWaitMs(lockWait, { seatId });

    const row = (rows as any)[0];
    if (!row) {
      throw new StaleLockError('STALE_LOCK:ROW_MISSING');
    }
    const currentVersion = Number(row.version);
    if (Number.isNaN(currentVersion) || currentVersion !== providedVersion) {
      throw new StaleLockError('STALE_LOCK:VERSION_MISMATCH');
    }

    return write(tx as unknown as typeof db);
  });
}


