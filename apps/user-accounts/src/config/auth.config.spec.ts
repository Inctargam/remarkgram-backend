import 'reflect-metadata';
import { authConfig } from './auth.config.js';

describe('authConfig', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_PRIVATE_KEY', 'private-key');
    vi.stubEnv('ACCESS_TOKEN_EXPIRES_IN', '10m');
    vi.stubEnv('REFRESH_TOKEN_EXPIRES_IN', '20m');
    vi.stubEnv('CONFIRMATION_CODE_EXPIRES_IN', '24');
    vi.stubEnv('RECOVERY_CODE_EXPIRES_IN', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads, transforms and validates auth config', () => {
    expect(authConfig()).toEqual({
      jwtPrivateKey: 'private-key',
      accessTokenExpiresIn: '10m',
      refreshTokenExpiresIn: '20m',
      confirmationCodeExpiresIn: 24,
      recoveryCodeExpiresIn: 1,
    });
  });

  it('throws when an auth variable is invalid', () => {
    vi.stubEnv('CONFIRMATION_CODE_EXPIRES_IN', 'invalid');

    expect(() => authConfig()).toThrow('Validation failed');
  });
});
