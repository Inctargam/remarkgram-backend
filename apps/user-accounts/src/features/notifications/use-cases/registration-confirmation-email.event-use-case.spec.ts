import { Logger } from '@nestjs/common';
import type { MailerService } from '@nestjs-modules/mailer';
import {
  buildRegistrationConfirmationUrl,
  RegistrationConfirmationEmailEvent,
  RegistrationConfirmationEmailHandler,
} from './registration-confirmation-email.event-use-case.js';

describe('buildRegistrationConfirmationUrl', () => {
  it('builds a registration confirmation URL from the configured frontend origin', () => {
    const url = buildRegistrationConfirmationUrl('confirmation-code', 'http://localhost:3000');

    expect(url.href).toBe('http://localhost:3000/auth/registration/confirmation?code=confirmation-code');
  });
});

describe('RegistrationConfirmationEmailHandler', () => {
  const sendMail =
    vi.fn<(options: { to: string; subject: string; text: string; html: string }) => Promise<void>>();
  const mailerService = {
    sendMail,
  };
  const handler = new RegistrationConfirmationEmailHandler(mailerService as unknown as MailerService, {
    baseUrl: 'http://localhost:3000',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue(undefined);
  });

  it('sends a registration confirmation email from the event', async () => {
    await handler.handle(new RegistrationConfirmationEmailEvent('user@example.com', 'confirmation-code'));

    expect(sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Confirm your Remarkgram email',
      text: sendMail.mock.calls[0][0].text,
      html: sendMail.mock.calls[0][0].html,
    });
    expect(sendMail.mock.calls[0][0].text).toContain('This link is active for 1 hour.');
    expect(sendMail.mock.calls[0][0].text).toContain(
      'http://localhost:3000/auth/registration/confirmation?code=confirmation-code',
    );
    expect(sendMail.mock.calls[0][0].html).toContain('Confirm email');
    expect(sendMail.mock.calls[0][0].html).toContain(
      'http://localhost:3000/auth/registration/confirmation?code=confirmation-code',
    );
  });

  it('logs and suppresses mail transport errors', async () => {
    const error = new Error('SMTP unavailable');
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    sendMail.mockRejectedValue(error);

    await expect(
      handler.handle(new RegistrationConfirmationEmailEvent('user@example.com', 'confirmation-code')),
    ).resolves.toBeUndefined();

    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to send registration confirmation email', error);
  });
});
