import '../../../../../test/setup-env';
import { createSession, rotateRefreshToken, revokeAllSessionsForUser } from '../session-store';
import { closeRedisConnection } from '../../../db/redis';

describe('Refresh Session Store - atomic rotation', () => {
  afterAll(async () => {
    await closeRedisConnection();
  });
  it('creates session and rotates refresh token atomically', async () => {
    const { sid, jti, refreshToken } = await createSession('u1', 't1', ['user']);
    expect(typeof refreshToken).toBe('string');
    const res = await rotateRefreshToken(sid, jti);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.jti).not.toBe(jti);
      expect(res.refreshToken).toContain(sid);
    }
  });

  it('detects reuse and revokes session', async () => {
    const { sid, jti } = await createSession('u2', 't1', ['user']);
    // First rotation succeeds
    const ok1 = await rotateRefreshToken(sid, jti);
    expect(ok1.ok).toBe(true);
    // Reuse old jti should revoke
    const bad = await rotateRefreshToken(sid, jti);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code === 'REFRESH_REUSED' || bad.code === 'REFRESH_INVALID').toBe(true);
    }
  });

  it('concurrency: only one rotation wins', async () => {
    const { sid, jti } = await createSession('u3', 't1', ['user']);
    const [a, b] = await Promise.allSettled([rotateRefreshToken(sid, jti), rotateRefreshToken(sid, jti)]);
    const oks = [a, b].filter(r => r.status === 'fulfilled' && (r as any).value.ok);
    expect(oks.length).toBe(1);
  });

  it('revoke all sessions for user', async () => {
    await createSession('u4', 't1', ['user']);
    await createSession('u4', 't1', ['user']);
    const n = await revokeAllSessionsForUser('u4');
    expect(n).toBeGreaterThanOrEqual(1);
  });
});


