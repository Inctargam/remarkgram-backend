import 'reflect-metadata';
import { passwordResetConfig } from './password-reset.config.js';

describe('passwordResetConfig', () => {
  beforeEach(() => {
    vi.stubEnv('PASSWORD_RESET_TOKEN_TTL_MINUTES', '30');
    vi.stubEnv('PASSWORD_RESET_TOKEN_SECRET', 'private');
    vi.stubEnv('PASSWORD_RESET_EMAIL_COOLDOWN_MINUTES', '2');
    vi.stubEnv('FRONTEND_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads, transforms and validates password reset config', () => {
    expect(passwordResetConfig()).toEqual({
      tokenTtlMinutes: 30,
      tokenSecret: 'private',
      emailCooldownMinutes: 2,
      frontendUrl: '',
    });
  });

  it('throws when password reset token ttl is invalid', () => {
    vi.stubEnv('PASSWORD_RESET_TOKEN_TTL_MINUTES', 'invalid');

    expect(() => passwordResetConfig()).toThrow('Validation failed');
  });

  it('throws when password reset token secret is missing', () => {
    vi.stubEnv('PASSWORD_RESET_TOKEN_SECRET', '');

    expect(() => passwordResetConfig()).toThrow('Validation failed');
  });

  it('throws when password reset email cooldown is invalid', () => {
    vi.stubEnv('PASSWORD_RESET_EMAIL_COOLDOWN_MINUTES', 'invalid');

    expect(() => passwordResetConfig()).toThrow('Validation failed');
  });
});
