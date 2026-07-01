import 'reflect-metadata';
import { emailConfig } from './email.config.js';

describe('emailConfig', () => {
  beforeEach(() => {
    vi.stubEnv('SMTP_URL', 'smtp.example.com');
    vi.stubEnv('EMAIL_LOGIN_GOOGLE', 'user@example.com');
    vi.stubEnv('EMAIL_PASSWORD_GOOGLE', 'password');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates email config', () => {
    expect(emailConfig()).toEqual({
      smtpUrl: 'smtp.example.com',
      emailCredentials: {
        user: 'user@example.com',
        password: 'password',
      },
    });
  });

  it('throws when an email variable is missing', () => {
    vi.stubEnv('SMTP_URL', '');

    expect(() => emailConfig()).toThrow('Validation failed');
  });
});
