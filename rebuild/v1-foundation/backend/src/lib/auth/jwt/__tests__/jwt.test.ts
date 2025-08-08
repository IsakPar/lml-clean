// TODO(PR5b): Re-enable once jest ESM transform for jose is finalized in config
import '../../../../../test/setup-env';
import { signAccessToken } from '../sign-access-token';
import { verifyAccessToken } from '../verify-access-token';

describe.skip('JWT sign/verify', () => {
  it('signs with iss/aud/kid and verifies with leeway', async () => {
    process.env.JWT_ISSUER = 'lml';
    process.env.JWT_AUDIENCE = 'lml.api';
    const token = await signAccessToken({
      sub: 'u1',
      tenant_id: 't1',
      roles: ['user'],
      sid: 's1',
      jti: 'j1',
    }, '60s');
    const data = await verifyAccessToken(token);
    expect(data.sub).toBe('u1');
    expect(data.tenant_id).toBe('t1');
    expect(Array.isArray(data.roles)).toBe(true);
  });
});


