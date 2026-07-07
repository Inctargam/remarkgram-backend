import { Inject, Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import type { ConfigType } from '@nestjs/config';
import { frontendConfig } from '../../config/frontend.config.js';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    @Inject(frontendConfig.KEY) private readonly frontend: ConfigType<typeof frontendConfig>,
  ) {}

  /** Отправляет пользователю ссылку с кодом подтверждения регистрации. */
  async sendConfirmationCode(to: string, code: string): Promise<void> {
    const url = new URL('/auth/registration/confirmation', this.frontend.baseUrl);
    url.searchParams.set('code', code);

    await this.mailerService.sendMail({
      to,
      subject: 'Confirm your email',
      text: `Thank you for your registration. To confirm your profile please follow the link below:\n${url.href}`,
      html: `<h1>Thank you for your registration</h1><p>To confirm your profile please follow the link below:</p><a href='${url.href}'>Complete registration</a>`,
    });
  }
}
