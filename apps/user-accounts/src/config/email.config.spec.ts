import 'reflect-metadata';
import { emailConfig } from './email.config.js';

describe('emailConfig', () => {
  beforeEach(() => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_SECURE', 'true');
    vi.stubEnv('EMAIL_LOGIN', 'user@example.com');
    vi.stubEnv('EMAIL_PASSWORD', 'password');
    vi.stubEnv('EMAIL_FROM', 'Remarkgram <no-reply@example.com>');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates email config', () => {
    expect(emailConfig()).toEqual({
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      emailFrom: 'Remarkgram <no-reply@example.com>',
      emailCredentials: {
        user: 'user@example.com',
        password: 'password',
      },
    });
  });

  it('uses email login as default sender when EMAIL_FROM is empty', () => {
    vi.stubEnv('EMAIL_FROM', '');

    expect(emailConfig().emailFrom).toBe('user@example.com');
  });

  it('throws when an email variable is missing', () => {
    vi.stubEnv('SMTP_HOST', '');

    expect(() => emailConfig()).toThrow('Validation failed');
  });

  it('throws when SMTP_SECURE is invalid', () => {
    vi.stubEnv('SMTP_SECURE', 'yes');

    expect(() => emailConfig()).toThrow('Config convertToBoolean failed');
  });
});
