import { buildPasswordResetUrl } from './password-reset-token-email.event-use-case.js';

describe('buildPasswordResetUrl', () => {
  it('builds a reset URL from the configured frontend origin', () => {
    const url = buildPasswordResetUrl('reset-token', 'http://localhost:3000');

    expect(url.href).toBe('http://localhost:3000/auth/password-reset/confirm?token=reset-token');
  });
});
