import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidPasswordResetTokenError } from '../errors/password-reset.errors.js';
import { PasswordHasher } from '../ports/password-hasher.js';
import { PasswordResetTokensRepository } from '../ports/password-reset-tokens.repository.js';
import { PasswordResetUsersRepository } from '../ports/password-reset-users.repository.js';
import { PasswordResetTokenService } from '../ports/password-reset-token.service.js';
import type { ConfirmPasswordResetParams } from '../types/password-reset.types.js';

export class ConfirmPasswordResetCommand extends Command<void> {
  constructor(public readonly params: ConfirmPasswordResetParams) {
    super();
  }
}

@CommandHandler(ConfirmPasswordResetCommand)
export class ConfirmPasswordResetUseCase implements ICommandHandler<ConfirmPasswordResetCommand> {
  constructor(
    private readonly usersRepository: PasswordResetUsersRepository,
    private readonly tokensRepository: PasswordResetTokensRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: PasswordResetTokenService,
  ) {}

  async execute(command: ConfirmPasswordResetCommand): Promise<void> {
    const now = new Date();
    const tokenHash = this.tokenService.hashToken(command.params.token);
    const resetToken = await this.tokensRepository.findByTokenHash(tokenHash);

    if (!resetToken) {
      throw new InvalidPasswordResetTokenError();
    }

    if (resetToken.isUsed()) {
      throw new InvalidPasswordResetTokenError();
    }

    if (resetToken.isRevoked()) {
      throw new InvalidPasswordResetTokenError();
    }

    if (resetToken.isExpired(now)) {
      throw new InvalidPasswordResetTokenError();
    }

    const passwordHash = await this.passwordHasher.hashPassword(command.params.newPassword);

    await this.usersRepository.updatePasswordHash(resetToken.userId, passwordHash);
    await this.tokensRepository.markAsUsed(resetToken.id, now);
  }
}
