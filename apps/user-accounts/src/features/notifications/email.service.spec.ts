import type { MailerService } from '@nestjs-modules/mailer';
import { EmailService } from './email.service.js';

describe('EmailService', () => {
  const sendMail =
    vi.fn<(options: { to: string; subject: string; text: string; html: string }) => Promise<void>>();
  const mailerService = {
    sendMail,
  };
  const service = new EmailService(mailerService as unknown as MailerService, {
    baseUrl: 'http://localhost:3000',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue(undefined);
  });

  it('sends a registration confirmation link using the configured frontend URL', async () => {
    await service.sendConfirmationCode('user@example.com', 'confirmation-code');

    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0][0].to).toBe('user@example.com');
    expect(sendMail.mock.calls[0][0].text).toContain(
      'http://localhost:3000/auth/registration/confirmation?code=confirmation-code',
    );
  });

  it('propagates mail transport errors', async () => {
    const error = new Error('SMTP unavailable');
    sendMail.mockRejectedValue(error);

    await expect(service.sendConfirmationCode('user@example.com', 'confirmation-code')).rejects.toBe(error);
  });
});
