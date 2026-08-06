import {
  buildPasswordResetEmailHtml,
  buildPasswordResetUrl,
} from './password-reset-token-email.event-use-case.js';

describe('buildPasswordResetUrl', () => {
  it('builds a reset URL from the configured frontend origin', () => {
    const url = buildPasswordResetUrl('reset-token', 'http://localhost:3000');

    expect(url.href).toBe('http://localhost:3000/auth/password-reset/confirm?token=reset-token');
  });

  it('encodes the reset token as a query parameter', () => {
    const url = buildPasswordResetUrl('token&next=/account', 'https://remarkgram.com');

    expect(url.searchParams.get('token')).toBe('token&next=/account');
    expect(url.searchParams.get('next')).toBeNull();
  });
});

describe('buildPasswordResetEmailHtml', () => {
  it('escapes the reset URL before inserting it into HTML', () => {
    const html = buildPasswordResetEmailHtml('https://remarkgram.com/reset?token=a&value="unsafe"');

    expect(html).toContain('https://remarkgram.com/reset?token=a&amp;value=&quot;unsafe&quot;');
    expect(html).not.toContain('href="https://remarkgram.com/reset?token=a&value="unsafe""');
  });
});
