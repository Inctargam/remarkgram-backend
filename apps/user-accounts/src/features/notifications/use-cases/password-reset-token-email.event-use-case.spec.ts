import { buildPasswordResetUrl } from './password-reset-token-email.event-use-case.js';

describe('buildPasswordResetUrl', () => {
  it('builds a reset URL from a frontend origin', () => {
    const url = buildPasswordResetUrl('reset-token', 'http://localhost:3000');

    expect(url.href).toBe('http://localhost:3000/auth/password-reset/confirm?token=reset-token');
  });

  it('supports localhost URLs without a protocol', () => {
    const url = buildPasswordResetUrl('reset-token', 'localhost:3000/recovery-password?token');

    expect(url.href).toBe('http://localhost:3000/recovery-password?token=reset-token');
  });

  it('uses the production frontend URL when config is empty', () => {
    const url = buildPasswordResetUrl('reset-token', '');

    expect(url.href).toBe('https://remarkgram.com/auth/password-reset/confirm?token=reset-token');
  });
});
