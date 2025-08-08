import { SignJWT } from 'jose';
import crypto from 'crypto';

export type AccessTokenClaims = {
  sub: string;
  tenant_id: string;
  roles: string[];
  sid: string;
  jti: string;
};

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set (>= 32 chars)');
  }
  return new TextEncoder().encode(secret);
}

function getIssuer(): string {
  return process.env.JWT_ISSUER || 'lml';
}

function getAudience(): string {
  return process.env.JWT_AUDIENCE || 'lml.api';
}

function getKid(): string {
  // If explicitly provided, use it; otherwise derive a stable kid from the secret hash
  const explicitKid = process.env.JWT_KID; // TODO(PR5b): support multiple kids and prev secrets
  if (explicitKid && explicitKid.trim().length > 0) return explicitKid.trim();
  const secret = process.env.JWT_SECRET || '';
  const hash = crypto.createHash('sha256').update(secret).digest('hex');
  return hash.slice(0, 16);
}

export async function signAccessToken(
  claims: AccessTokenClaims,
  expiresIn: string = process.env.JWT_EXPIRES_IN || '15m'
): Promise<string> {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const iss = getIssuer();
  const aud = getAudience();
  const kid = getKid();

  // Header includes kid to allow clean rotation later
  const jwt = await new SignJWT({
    sub: claims.sub,
    tenant_id: claims.tenant_id,
    roles: claims.roles,
    sid: claims.sid,
    jti: claims.jti,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid })
    .setIssuedAt(now)
    .setIssuer(iss)
    .setAudience(aud)
    .setExpirationTime(expiresIn)
    .sign(secret);

  return jwt;
}


