import { Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import type { AuthIdentityProvider } from '../../auth-identities/domain/auth-identity.entity.js';

export class OAuthRegistrationSuccessEmailEvent {
  constructor(
    public readonly email: string,
    public readonly provider: AuthIdentityProvider,
  ) {}
}

@EventsHandler(OAuthRegistrationSuccessEmailEvent)
export class OAuthRegistrationSuccessEmailHandler implements IEventHandler<OAuthRegistrationSuccessEmailEvent> {
  private readonly logger = new Logger(OAuthRegistrationSuccessEmailHandler.name);

  constructor(private readonly mailerService: MailerService) {}

  async handle(event: OAuthRegistrationSuccessEmailEvent): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: event.email,
        subject: 'Welcome to Remarkgram',
        text: `Your Remarkgram account was successfully created using ${event.provider}.`,
        html: `<p>Your Remarkgram account was successfully created using <strong>${event.provider}</strong>.</p>`,
      });
    } catch (error) {
      this.logger.error('Failed to send OAuth registration success email', error);
    }
  }
}
