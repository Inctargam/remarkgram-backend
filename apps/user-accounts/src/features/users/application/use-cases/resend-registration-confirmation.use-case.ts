import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { authConfig } from '../../../../config/auth.config.js';
import { EmailService } from '../../../notifications/email.service.js';
import { EmailAlreadyConfirmedError, IncorrectEmailError } from '../errors/users.errors.js';
import { UsersRepository } from '../ports/users.repository.js';

export class ResendRegistrationConfirmationCommand extends Command<void> {
  constructor(public readonly email: string) {
    super();
  }
}

@CommandHandler(ResendRegistrationConfirmationCommand)
export class ResendRegistrationConfirmationUseCase implements ICommandHandler<ResendRegistrationConfirmationCommand> {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly emailService: EmailService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async execute(command: ResendRegistrationConfirmationCommand) {
    const user = await this.usersRepository.findByEmail(command.email);

    if (!user) {
      throw new IncorrectEmailError();
    }

    if (user.confirmation.isConfirmed) {
      throw new EmailAlreadyConfirmedError();
    }

    const code = crypto.randomUUID();
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + this.auth.confirmationCodeExpiresIn);

    const wasUpdated = await this.usersRepository.updateConfirmationCode({
      email: command.email,
      code,
      expiration,
    });

    if (!wasUpdated) {
      throw new EmailAlreadyConfirmedError();
    }

    await this.emailService.sendConfirmationCode(command.email, code);
  }
}
