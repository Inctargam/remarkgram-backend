import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { authConfig } from '../../../../config/auth.config.js';
import { EmailService } from '../../../notifications/email.service.js';
import { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import { UsersRepository } from '../ports/users.repository.js';
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
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async execute(command: RegisterUserCommand) {
    const now = new Date();

    // email и username резервируются за пользователем на время срока жизни кода подтверждения
    // Удаляем через soft delete всех пользователей с совпадающим email или username и истекшим кодом
    await this.usersRepository.releaseExpiredRegistrationCredentials({
      username: command.params.username,
      email: command.params.email,
      now,
    });

    const code = crypto.randomUUID();
    const expiration = new Date(now);
    expiration.setHours(expiration.getHours() + this.auth.confirmationCodeExpiresIn);

    await this.usersService.createUser({
      ...command.params,
      confirmation: ConfirmationInfo.pending(code, expiration),
      passwordRecovery: { code: null, expiration: null },
    });

    await this.emailService.sendConfirmationCode(command.params.email, code);
  }
}
