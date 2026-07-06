import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  /** Отправляет пользователю ссылку с кодом подтверждения регистрации. */
  async sendConfirmationCode(to: string, code: string): Promise<void> {
    const url = new URL('/auth/registration/confirmation', 'https://remarkgram.com/');
    url.searchParams.set('code', code);

    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Confirm your email',
        text: `Thank you for your registration. To confirm your profile please follow the link below:\n${url.href}`,
        html: `<h1>Thank you for your registration</h1><p>To confirm your profile please follow the link below:</p><a href='${url.href}'>Complete registration</a>`,
      });
    } catch (error) {
      this.logger.error('Failed to send registration confirmation email', error);
    }
  }
}
