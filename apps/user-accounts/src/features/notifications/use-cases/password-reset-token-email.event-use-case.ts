import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { MailerService } from '@nestjs-modules/mailer';
import { Inject, Logger } from '@nestjs/common';
import { passwordResetConfig } from '../../../config/password-reset.config.js';
import type { ConfigType } from '@nestjs/config';

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
    @Inject(passwordResetConfig.KEY) private readonly config: ConfigType<typeof passwordResetConfig>,
  ) {}

  async handle(event: PasswordResetTokenEmailEvent): Promise<void> {
    const url = this.buildPasswordResetUrl(event.token);

    try {
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

  private buildPasswordResetUrl(token: string): URL {
    const frontendUrl = this.config.frontendUrl || 'https://remarkgram.com';
    const url = new URL('/auth/password-reset/confirm', frontendUrl);
    url.searchParams.set('token', token);

    return url;
  }
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
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">Reset your Remarkgram password</h2>
      <p>We received a request to reset the password for your Remarkgram account.</p>
      <p>
        <a
          href="${resetUrl}"
          style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;"
        >
          Set new password
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
      <p>Remarkgram support</p>
    </div>
  `;
}
