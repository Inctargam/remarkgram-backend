import { createHmac } from 'node:crypto';
import { HmacPasswordResetTokenService } from './hmac-password-reset-token.service.js';

describe('HmacPasswordResetTokenService', () => {
  const config = {
    tokenTtlMinutes: 30,
    tokenSecret: 'test-secret',
    emailCooldownMinutes: 2,
    frontendUrl: 'http://localhost:3000',
  };

  let service: HmacPasswordResetTokenService;

  beforeEach(() => {
    service = new HmacPasswordResetTokenService(config);
  });

  it('generates a random 32-byte hex token and its HMAC hash', () => {
    const pair = service.generateTokenPair();

    expect(pair.rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(pair.tokenHash).toBe(service.hashToken(pair.rawToken));
  });

  it('hashes a token with the configured secret', () => {
    const rawToken = 'raw-reset-token';
    const expectedHash = createHmac('sha256', config.tokenSecret).update(rawToken).digest('hex');

    expect(service.hashToken(rawToken)).toBe(expectedHash);
  });
});
