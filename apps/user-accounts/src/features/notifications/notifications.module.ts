import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import type { ConfigType } from '@nestjs/config';
import { emailConfig } from '../../config/email.config.js';
import { EmailService } from './email.service.js';
import { PasswordResetTokenEmailHandler } from './use-cases/password-reset-token-email.event-use-case.js';

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [emailConfig.KEY],
      useFactory: (email: ConfigType<typeof emailConfig>) => {
        return {
          transport: {
            host: email.smtpUrl,
            auth: {
              user: email.emailCredentials.user,
              pass: email.emailCredentials.password,
            },
            port: 465,
            secure: true,
          },
          defaults: {
            from: email.emailCredentials.user,
          },
        };
      },
    }),
  ],
  providers: [EmailService, PasswordResetTokenEmailHandler],
  exports: [EmailService],
})
export class NotificationsModule {}
