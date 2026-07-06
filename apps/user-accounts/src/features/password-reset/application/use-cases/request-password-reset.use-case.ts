import { Command, CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { PasswordResetTokensRepository } from '../ports/password-reset-tokens.repository.js';
import { PasswordResetUsersRepository } from '../ports/password-reset-users.repository.js';
import type {
  RequestPasswordResetParams,
  RequestPasswordResetResult,
} from '../types/password-reset.types.js';
import { Inject } from '@nestjs/common';
import { passwordResetConfig } from '../../../../config/password-reset.config.js';
import type { ConfigType } from '@nestjs/config';
import { PasswordResetTokenEmailEvent } from '../../../notifications/use-cases/password-reset-token-email.event-use-case.js';
import { PasswordResetTokenService } from '../ports/password-reset-token.service.js';

export class RequestPasswordResetCommand extends Command<RequestPasswordResetResult> {
  constructor(public readonly params: RequestPasswordResetParams) {
    super();
  }
}

@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetUseCase implements ICommandHandler<RequestPasswordResetCommand> {
  constructor(
    private readonly usersRepository: PasswordResetUsersRepository,
    private readonly tokensRepository: PasswordResetTokensRepository,
    @Inject(passwordResetConfig.KEY) private readonly config: ConfigType<typeof passwordResetConfig>,
    private readonly eventBus: EventBus,
    private readonly tokenService: PasswordResetTokenService,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<RequestPasswordResetResult> {
    const user = await this.usersRepository.findByConfirmedEmail(command.params.email);

    if (!user) {
      return;
    }
    const now = new Date();
    const cooldownStartedAt = new Date(now.getTime() - this.config.emailCooldownMinutes * 60_000);
    const hasRecentToken = await this.tokensRepository.existsCreatedAfter(user.id, cooldownStartedAt);

    if (hasRecentToken) {
      return;
    }

    const expiresAt = new Date(now);
    expiresAt.setMinutes(expiresAt.getMinutes() + this.config.tokenTtlMinutes);

    const { rawToken, tokenHash } = this.tokenService.generateTokenPair();

    await this.tokensRepository.revokeActiveByUserId(user.id, now);
    await this.tokensRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      createdAt: now,
    });

    this.eventBus.publish(new PasswordResetTokenEmailEvent(user.email, rawToken));
  }
}
