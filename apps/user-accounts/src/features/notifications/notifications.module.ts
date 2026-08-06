import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import type { ConfigType } from '@nestjs/config';
import { emailConfig } from '../../config/email.config.js';
import { PasswordResetTokenEmailHandler } from './use-cases/password-reset-token-email.event-use-case.js';
import { RegistrationConfirmationEmailHandler } from './use-cases/registration-confirmation-email.event-use-case.js';
import { OAuthRegistrationSuccessEmailHandler } from './use-cases/oauth-registration-success-email.event-use-case.js';

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [emailConfig.KEY],
      useFactory: (email: ConfigType<typeof emailConfig>) => {
        return {
          transport: {
            host: email.smtpHost,
            port: email.smtpPort,
            secure: email.smtpSecure,
            auth: {
              user: email.emailCredentials.user,
              pass: email.emailCredentials.password,
            },
          },
          defaults: {
            from: email.emailFrom,
          },
        };
      },
    }),
  ],
  providers: [
    PasswordResetTokenEmailHandler,
    RegistrationConfirmationEmailHandler,
    OAuthRegistrationSuccessEmailHandler,
  ],
})
export class NotificationsModule {}
