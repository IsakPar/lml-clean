import { getRedisClient } from '../../db/redis';
import { randomUUID, randomBytes } from 'crypto';

export type SessionRecord = {
  userId: string;
  tenantId: string;
  roles: string[];
  currentJti: string;
  createdAt: string;
  lastRotatedAt: string;
  ua_hash?: string;
  ip_hash?: string;
  device_label?: string;
};

export type RotationResult =
  | { ok: true; sid: string; jti: string; refreshToken: string; session: SessionRecord }
  | { ok: false; code: 'REFRESH_INVALID' | 'REFRESH_REUSED' | 'SESSION_REVOKED'; };

function getSessionTtlSeconds(): number {
  const days = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
  return Math.max(1, days) * 24 * 60 * 60;
}

function getAuthPrefix(): string {
  return process.env.AUTH_PREFIX || 'auth';
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(
  userId: string,
  tenantId: string,
  roles: string[],
  meta?: { ua_hash?: string; ip_hash?: string; device_label?: string }
): Promise<{ sid: string; jti: string; refreshToken: string; session: SessionRecord }> {
  const redis = getRedisClient();
  await ensureRedisConnected(redis);
  const sid = randomUUID();
  const jti = randomUUID();
  const nowIso = new Date().toISOString();
  const session: SessionRecord = {
    userId,
    tenantId,
    roles,
    currentJti: jti,
    createdAt: nowIso,
    lastRotatedAt: nowIso,
    ua_hash: meta?.ua_hash,
    ip_hash: meta?.ip_hash,
    device_label: meta?.device_label,
  };
  const ttl = getSessionTtlSeconds();
  const prefix = getAuthPrefix();
  await redis.set(`${prefix}:sess:${sid}`, JSON.stringify(session), 'EX', ttl);
  const refreshToken = `${sid}.${jti}.${generateOpaqueToken()}`;
  return { sid, jti, refreshToken, session };
}

/**
 * Atomic rotation with Lua to avoid races.
 * Inputs: sid, presentedJti, newJti
 * Behavior:
 * - If sess missing → REFRESH_INVALID
 * - If sess.currentJti !== presentedJti → mark revoked and delete session → REFRESH_REUSED
 * - Else: set rt:sid:oldJti used, update sess.currentJti=newJti and lastRotatedAt, refresh TTL, return OK
 */
const ROTATE_LUA = `
local sessKey = KEYS[1]
local usedKey = KEYS[2]
local revokedKey = KEYS[3]
local presentedJti = ARGV[1]
local newJti = ARGV[2]
local ttl = tonumber(ARGV[3])
local nowIso = ARGV[4]
local raw = redis.call('GET', sessKey)
if not raw then return {'MISSING'} end
local sess = cjson.decode(raw)
local current = sess.currentJti
if current ~= presentedJti then
  redis.call('SET', revokedKey, '1', 'EX', ttl)
  redis.call('DEL', sessKey)
  return {'REUSED'}
end
-- Mark old jti used
redis.call('SET', usedKey, '1', 'EX', ttl)
-- Rotate
sess.currentJti = newJti
sess.lastRotatedAt = nowIso
redis.call('SET', sessKey, cjson.encode(sess), 'EX', ttl)
return {'OK'}
`;

export async function rotateRefreshToken(
  sid: string,
  presentedJti: string
): Promise<RotationResult> {
  const redis = getRedisClient();
  await ensureRedisConnected(redis);
  const newJti = randomUUID();
  const ttl = getSessionTtlSeconds();
  const nowIso = new Date().toISOString();
  const prefix = getAuthPrefix();
  const sessKey = `${prefix}:sess:${sid}`;
  const usedKey = `${prefix}:rt:${sid}:${presentedJti}`;
  const revokedKey = `${prefix}:sess:revoked:${sid}`;
  const res = (await redis.eval(ROTATE_LUA, 3, sessKey, usedKey, revokedKey, presentedJti, newJti, String(ttl), nowIso)) as any;
  const code = Array.isArray(res) ? (res[1] as string) : 'MISSING';
  if (code !== 'OK') {
    return { ok: false, code: code === 'REUSED' ? 'REFRESH_REUSED' : 'REFRESH_INVALID' } as RotationResult;
  }
  const refreshToken = `${sid}.${newJti}.${generateOpaqueToken()}`;
  const sessionRaw = await redis.get(sessKey);
  const session: SessionRecord = sessionRaw ? (JSON.parse(sessionRaw) as SessionRecord) : ({} as any);
  return { ok: true, sid, jti: newJti, refreshToken, session };
}

export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const redis = getRedisClient();
  await ensureRedisConnected(redis);
  // naive scan-based; acceptable for PR5a tests
  let cursor = '0';
  let count = 0;
  const prefix = getAuthPrefix();
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:sess:*`, 'COUNT', 200);
    cursor = next as string;
    if (Array.isArray(keys) && keys.length) {
      const sessions = await redis.mget(keys as string[]);
      for (let i = 0; i < keys.length; i++) {
        const raw = sessions[i] as string | null;
        if (!raw) continue;
        try {
          const sess = JSON.parse(raw) as SessionRecord;
          if (sess.userId === userId) {
            await redis.del(keys[i] as string);
            count++;
          }
        } catch {}
      }
    }
  } while (cursor !== '0');
  return count;
}

async function ensureRedisConnected(redis: any): Promise<void> {
  try {
    const status = String(redis?.status || '');
    if (status === 'ready' || status === 'connecting') return;
    await redis.connect();
  } catch (_) {
    // If connect throws due to already connecting/connected, ignore
  }
}


