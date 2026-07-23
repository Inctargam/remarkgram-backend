import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { MailerService } from '@nestjs-modules/mailer';
import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { frontendConfig } from '../../../config/frontend.config.js';

const PASSWORD_RESET_PATH = '/auth/password-reset/confirm';

export class PasswordResetTokenEmailEvent {
  constructor(
    public readonly email: string,
    public readonly token: string,
  ) {}
}

@EventsHandler(PasswordResetTokenEmailEvent)
export class PasswordResetTokenEmailHandler implements IEventHandler<PasswordResetTokenEmailEvent> {
  private readonly logger = new Logger(PasswordResetTokenEmailHandler.name);

  constructor(
    private readonly mailerService: MailerService,
    @Inject(frontendConfig.KEY) private readonly frontend: ConfigType<typeof frontendConfig>,
  ) {}

  async handle(event: PasswordResetTokenEmailEvent): Promise<void> {
    try {
      // Исправлено: построение URL также должно входить в защищённый блок,
      // чтобы любая ошибка подготовки уведомления была зарегистрирована обработчиком.
      const url = buildPasswordResetUrl(event.token, this.frontend.baseUrl);

      await this.mailerService.sendMail({
        to: event.email,
        subject: 'Reset your Remarkgram password',
        text: buildPasswordResetEmailText(url.href),
        html: buildPasswordResetEmailHtml(url.href),
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email', error);
    }
  }
}

export function buildPasswordResetUrl(token: string, frontendUrl: string): URL {
  const url = new URL(PASSWORD_RESET_PATH, frontendUrl);
  url.searchParams.set('token', token);

  return url;
}

export function buildPasswordResetEmailText(resetUrl: string): string {
  return [
    'Hello,',
    '',
    'We received a request to reset the password for your Remarkgram account.',
    'To set a new password, open this link:',
    resetUrl,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
    '',
    'Remarkgram support',
  ].join('\n');
}

export function buildPasswordResetEmailHtml(resetUrl: string): string {
  // Исправлено: URL используется в HTML-атрибуте и тексте, поэтому его необходимо
  // экранировать независимо от того, как был сгенерирован reset token.
  const escapedResetUrl = escapeHtml(resetUrl);

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">Reset your Remarkgram password</h2>
      <p>We received a request to reset the password for your Remarkgram account.</p>
      <p>
        <a
          href="${escapedResetUrl}"
          style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;"
        >
          Set new password
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${escapedResetUrl}">${escapedResetUrl}</a></p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
      <p>Remarkgram support</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character];
  });
}
