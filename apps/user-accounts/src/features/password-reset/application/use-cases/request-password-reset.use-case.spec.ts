import type { EventBus } from '@nestjs/cqrs';
import type { PasswordResetTokensRepository } from '../ports/password-reset-tokens.repository.js';
import type { PasswordResetUsersRepository } from '../ports/password-reset-users.repository.js';
import { PasswordResetTokenEmailEvent } from '../../../notifications/use-cases/password-reset-token-email.event-use-case.js';
import {
  RequestPasswordResetCommand,
  RequestPasswordResetUseCase,
} from './request-password-reset.use-case.js';
import type { PasswordResetTokenService } from '../ports/password-reset-token.service.js';

describe('RequestPasswordResetUseCase', () => {
  const now = new Date('2026-07-01T12:00:00.000Z');
  const passResetConfig = {
    tokenTtlMinutes: 30,
    tokenSecret: 'test-secret',
    emailCooldownMinutes: 2,
    frontendUrl: 'http://localhost:3000',
  };

  let usersRepository: {
    findByConfirmedEmail: ReturnType<typeof vi.fn<PasswordResetUsersRepository['findByConfirmedEmail']>>;
    updatePasswordHash: ReturnType<typeof vi.fn<PasswordResetUsersRepository['updatePasswordHash']>>;
  };
  let tokensRepository: {
    create: ReturnType<typeof vi.fn<PasswordResetTokensRepository['create']>>;
    findByTokenHash: ReturnType<typeof vi.fn<PasswordResetTokensRepository['findByTokenHash']>>;
    revokeActiveByUserId: ReturnType<typeof vi.fn<PasswordResetTokensRepository['revokeActiveByUserId']>>;
    markAsUsed: ReturnType<typeof vi.fn<PasswordResetTokensRepository['markAsUsed']>>;
    existsCreatedAfter: ReturnType<typeof vi.fn<PasswordResetTokensRepository['existsCreatedAfter']>>;
  };
  let eventBus: {
    publish: ReturnType<typeof vi.fn>;
  };
  let tokenService: {
    generateTokenPair: ReturnType<typeof vi.fn<PasswordResetTokenService['generateTokenPair']>>;
    hashToken: ReturnType<typeof vi.fn<PasswordResetTokenService['hashToken']>>;
  };
  let useCase: RequestPasswordResetUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    usersRepository = {
      findByConfirmedEmail: vi.fn(),
      updatePasswordHash: vi.fn(),
    };
    tokensRepository = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      revokeActiveByUserId: vi.fn().mockResolvedValue(undefined),
      markAsUsed: vi.fn(),
      existsCreatedAfter: vi.fn().mockResolvedValue(false),
    };
    eventBus = {
      publish: vi.fn(),
    };
    tokenService = {
      generateTokenPair: vi.fn().mockReturnValue({
        rawToken: 'raw-reset-token',
        tokenHash: 'hashed-reset-token',
      }),
      hashToken: vi.fn(),
    };
    useCase = new RequestPasswordResetUseCase(
      usersRepository,
      tokensRepository,
      passResetConfig,
      eventBus as unknown as EventBus,
      tokenService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('does not create a token and send email when confirmed user is not found', async () => {
    usersRepository.findByConfirmedEmail.mockResolvedValue(null);

    await expect(
      useCase.execute(new RequestPasswordResetCommand({ email: 'missing@example.com' })),
    ).resolves.toBeUndefined();

    expect(usersRepository.findByConfirmedEmail).toHaveBeenCalledWith('missing@example.com');
    expect(tokensRepository.revokeActiveByUserId).not.toHaveBeenCalled();
    expect(tokensRepository.create).not.toHaveBeenCalled();
    expect(tokenService.generateTokenPair).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('revokes active tokens and creates a hashed reset token for confirmed user', async () => {
    usersRepository.findByConfirmedEmail.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
    });

    await expect(
      useCase.execute(new RequestPasswordResetCommand({ email: 'user@example.com' })),
    ).resolves.toBeUndefined();

    expect(tokenService.generateTokenPair).toHaveBeenCalledOnce();
    expect(tokensRepository.revokeActiveByUserId).toHaveBeenCalledWith(1, now);
    expect(tokensRepository.create).toHaveBeenCalledWith({
      userId: 1,
      tokenHash: 'hashed-reset-token',
      createdAt: now,
      expiresAt: new Date('2026-07-01T12:30:00.000Z'),
    });

    expect(tokensRepository.revokeActiveByUserId).toHaveBeenCalledBefore(tokensRepository.create);
    expect(eventBus.publish).toHaveBeenCalledWith(
      new PasswordResetTokenEmailEvent('user@example.com', 'raw-reset-token'),
    );
  });
});
