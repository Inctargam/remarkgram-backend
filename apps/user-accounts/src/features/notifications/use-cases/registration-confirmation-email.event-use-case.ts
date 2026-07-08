import { Inject, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import type { ConfigType } from '@nestjs/config';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { frontendConfig } from '../../../config/frontend.config.js';

const REGISTRATION_CONFIRMATION_PATH = '/auth/registration/confirmation';

export class RegistrationConfirmationEmailEvent {
  constructor(
    public readonly email: string,
    public readonly code: string,
  ) {}
}

@EventsHandler(RegistrationConfirmationEmailEvent)
export class RegistrationConfirmationEmailHandler implements IEventHandler<RegistrationConfirmationEmailEvent> {
  private readonly logger = new Logger(RegistrationConfirmationEmailHandler.name);

  constructor(
    private readonly mailerService: MailerService,
    @Inject(frontendConfig.KEY) private readonly frontend: ConfigType<typeof frontendConfig>,
  ) {}

  async handle(event: RegistrationConfirmationEmailEvent): Promise<void> {
    const url = buildRegistrationConfirmationUrl(event.code, this.frontend.baseUrl);

    try {
      await this.mailerService.sendMail({
        to: event.email,
        subject: 'Confirm your Remarkgram email',
        text: buildRegistrationConfirmationEmailText(url.href),
        html: buildRegistrationConfirmationEmailHtml(url.href),
      });
    } catch (error) {
      this.logger.error('Failed to send registration confirmation email', error);
    }
  }
}

export function buildRegistrationConfirmationUrl(code: string, frontendUrl: string): URL {
  const url = new URL(REGISTRATION_CONFIRMATION_PATH, frontendUrl);
  url.searchParams.set('code', code);

  return url;
}

export function buildRegistrationConfirmationEmailText(confirmationUrl: string): string {
  return [
    'Hello,',
    '',
    'Thank you for creating a Remarkgram account.',
    'To confirm your email, open this link:',
    confirmationUrl,
    '',
    'This link is active for 1 hour.',
    '',
    'If you did not create an account, you can safely ignore this email.',
    '',
    'Remarkgram support',
  ].join('\n');
}

export function buildRegistrationConfirmationEmailHtml(confirmationUrl: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">Confirm your Remarkgram email</h2>
      <p>Thank you for creating a Remarkgram account.</p>
      <p>To confirm your email, open this link:</p>
      <p>
        <a
          href="${confirmationUrl}"
          style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;"
        >
          Confirm email
        </a>
      </p>
      <p>This link is active for 1 hour.</p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${confirmationUrl}">${confirmationUrl}</a></p>
      <p>If you did not create an account, you can safely ignore this email.</p>
      <p>Remarkgram support</p>
    </div>
  `;
}
