import { type RedisClientType } from 'redis';
import fs from 'node:fs';
import path from 'node:path';

const scriptShaCache = new Map<string, string>();

export async function loadLuaScript(
  client: RedisClientType,
  name: 'extend_lock' | 'release_lock' | 'rollback_locks',
): Promise<string> {
  const cached = scriptShaCache.get(name);
  if (cached) return cached;
  const file = path.join(__dirname, `${name}.lua`);
  const source = fs.readFileSync(file, 'utf8');
  // @ts-expect-error redis v4 types
  const sha: string = await client.scriptLoad(source);
  scriptShaCache.set(name, sha);
  return sha;
}


