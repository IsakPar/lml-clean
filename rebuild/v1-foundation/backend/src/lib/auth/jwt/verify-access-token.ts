import { jwtVerify } from 'jose';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set (>= 32 chars)');
  }
  return new TextEncoder().encode(secret);
}

export type VerifiedAccess = {
  sub: string;
  tenant_id: string;
  roles: string[];
  sid: string;
  jti: string;
};

export async function verifyAccessToken(token: string): Promise<VerifiedAccess> {
  const secret = getJwtSecret();
  const issuer = process.env.JWT_ISSUER || 'lml';
  const audience = process.env.JWT_AUDIENCE || 'lml.api';
  // Allow ±60s skew
  const clockTolerance = 60;
  const { payload } = await jwtVerify(token, secret, { issuer, audience, clockTolerance });
  return {
    sub: String(payload.sub || ''),
    tenant_id: String((payload as any).tenant_id || ''),
    roles: Array.isArray((payload as any).roles) ? ((payload as any).roles as string[]) : [],
    sid: String((payload as any).sid || ''),
    jti: String((payload as any).jti || ''),
  };
}


