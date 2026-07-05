import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { authConfig } from '../../../../config/auth.config.js';
import { EmailService } from '../../../notifications/email.service.js';
import type { RegisterUserParams } from '../types/users.types.js';
import { UsersService } from '../users.service.js';

export class RegisterUserCommand extends Command<void> {
  constructor(public readonly params: RegisterUserParams) {
    super();
  }
}

@CommandHandler(RegisterUserCommand)
export class RegisterUserUseCase implements ICommandHandler<RegisterUserCommand> {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async execute(command: RegisterUserCommand) {
    const code = crypto.randomUUID();
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + this.auth.confirmationCodeExpiresIn);

    await this.usersService.createUser({
      ...command.params,
      confirmation: { isConfirmed: false, code, expiration },
      passwordRecovery: { code: null, expiration: null },
    });

    await this.emailService.sendConfirmationCode(command.params.email, code);
  }
}
