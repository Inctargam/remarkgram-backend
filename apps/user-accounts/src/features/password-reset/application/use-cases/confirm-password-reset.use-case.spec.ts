import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { PasswordResetTokensRepository } from '../ports/password-reset-tokens.repository.js';
import type { PasswordResetUsersRepository } from '../ports/password-reset-users.repository.js';
import { PasswordHasher } from '../ports/password-hasher.js';
import {
  ConfirmPasswordResetCommand,
  ConfirmPasswordResetUseCase,
} from './confirm-password-reset.use-case.js';
import { InvalidPasswordResetTokenError } from '../errors/password-reset.errors.js';
import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity.js';
import { expect } from 'vitest';
import type { UnitOfWork } from '../../../../common/application/unit-of-work.js';
import type { PasswordResetSessionInvalidator } from '../ports/password-reset-session-invalidator.js';
import type { PasswordResetTokenService } from '../ports/password-reset-token.service.js';

describe('ConfirmPasswordResetUseCase', () => {
  const now = new Date('2026-07-01T12:00:00.000Z');

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

  let passwordHasher: {
    hashPassword: ReturnType<typeof vi.fn<PasswordHasher['hashPassword']>>;
  };
  let tokenService: {
    generateTokenPair: ReturnType<typeof vi.fn<PasswordResetTokenService['generateTokenPair']>>;
    hashToken: ReturnType<typeof vi.fn<PasswordResetTokenService['hashToken']>>;
  };
  let sessionInvalidator: {
    invalidateAllUserSessions: ReturnType<
      typeof vi.fn<PasswordResetSessionInvalidator['invalidateAllUserSessions']>
    >;
  };
  let unitOfWork: {
    run: ReturnType<typeof vi.fn<UnitOfWork['run']>>;
  };
  let useCase: ConfirmPasswordResetUseCase;

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
      existsCreatedAfter: vi.fn(),
    };

    passwordHasher = {
      hashPassword: vi.fn(),
    };
    tokenService = {
      generateTokenPair: vi.fn(),
      hashToken: vi.fn().mockReturnValue('hashed-reset-token'),
    };
    sessionInvalidator = {
      invalidateAllUserSessions: vi.fn().mockResolvedValue(undefined),
    };
    unitOfWork = {
      run: vi.fn(async (handler) => handler('transaction-context')),
    };

    useCase = new ConfirmPasswordResetUseCase(
      usersRepository,
      tokensRepository,
      passwordHasher,
      tokenService,
      sessionInvalidator,
      unitOfWork as unknown as UnitOfWork,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.setSystemTime(now);
    vi.restoreAllMocks();
  });

  it('returns the error: InvalidPasswordResetTokenError, when token not found', async () => {
    tokensRepository.findByTokenHash.mockResolvedValue(null);

    await expect(
      useCase.execute(
        new ConfirmPasswordResetCommand({
          token: 'rest-token-invalid',
          newPassword: 'newPassword',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    expect(tokenService.hashToken).toHaveBeenCalledWith('rest-token-invalid');
    expect(tokensRepository.findByTokenHash).toHaveBeenCalledWith('hashed-reset-token');
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(passwordHasher.hashPassword).not.toHaveBeenCalled();
    expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(tokensRepository.markAsUsed).not.toHaveBeenCalled();
    expect(sessionInvalidator.invalidateAllUserSessions).not.toHaveBeenCalled();
  });

  it('returns InvalidPasswordResetTokenError when attempting to reuse a token', async () => {
    const token = PasswordResetToken.restore({
      id: randomUUID(),
      userId: 1,
      tokenHash: 'hashed-reset-token',
      createdAt: now,
      expiresAt: new Date('2026-07-01T12:30:00.000Z'),
      usedAt: new Date('2026-07-01T12:10:00.000Z'),
      revokedAt: null,
    });
    tokensRepository.findByTokenHash.mockResolvedValue(token);

    await expect(
      useCase.execute(new ConfirmPasswordResetCommand({ token: 'token', newPassword: 'newPassword' })),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    expect(tokenService.hashToken).toHaveBeenCalledWith('token');
    expect(tokensRepository.findByTokenHash).toHaveBeenCalledWith('hashed-reset-token');
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(passwordHasher.hashPassword).not.toHaveBeenCalled();
    expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(tokensRepository.markAsUsed).not.toHaveBeenCalled();
    expect(sessionInvalidator.invalidateAllUserSessions).not.toHaveBeenCalled();
  });

  it('success update password and mark as used token for confirmed user', async () => {
    const inputDtoCmd = {
      token: 'token',
      newPassword: 'new-password',
    };
    passwordHasher.hashPassword.mockResolvedValue('hashed-' + inputDtoCmd.newPassword);

    usersRepository.findByConfirmedEmail.mockResolvedValue({
      id: 1,
      email: 'test@test.com',
    });

    const passwordResetToken = PasswordResetToken.restore({
      id: randomUUID(),
      userId: 1,
      tokenHash: 'hashed-reset-token',
      createdAt: now,
      expiresAt: new Date('2026-07-01T12:30:00.000Z'),
      usedAt: null,
      revokedAt: null,
    });

    tokensRepository.findByTokenHash.mockResolvedValue(passwordResetToken);

    await expect(
      useCase.execute(
        new ConfirmPasswordResetCommand({
          token: inputDtoCmd.token,
          newPassword: inputDtoCmd.newPassword,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(tokenService.hashToken).toHaveBeenCalledWith(inputDtoCmd.token);
    expect(tokensRepository.findByTokenHash).toHaveBeenCalledWith('hashed-reset-token');
    expect(passwordHasher.hashPassword).toHaveBeenCalledWith(inputDtoCmd.newPassword);
    expect(unitOfWork.run).toHaveBeenCalledOnce();
    expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith(
      1,
      'hashed-' + inputDtoCmd.newPassword,
      'transaction-context',
    );
    expect(tokensRepository.markAsUsed).toHaveBeenCalledWith(
      passwordResetToken.id,
      now,
      'transaction-context',
    );
    expect(sessionInvalidator.invalidateAllUserSessions).toHaveBeenCalledWith(1, 'transaction-context');
  });

  it('logs and rethrows transaction errors', async () => {
    const error = new Error('transaction failed');
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    passwordHasher.hashPassword.mockResolvedValue('hashed-new-password');
    unitOfWork.run.mockRejectedValue(error);

    tokensRepository.findByTokenHash.mockResolvedValue(
      PasswordResetToken.restore({
        id: randomUUID(),
        userId: 1,
        tokenHash: 'hashed-reset-token',
        createdAt: now,
        expiresAt: new Date('2026-07-01T12:30:00.000Z'),
        usedAt: null,
        revokedAt: null,
      }),
    );

    await expect(
      useCase.execute(new ConfirmPasswordResetCommand({ token: 'token', newPassword: 'new-password' })),
    ).rejects.toBe(error);

    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to confirm password reset transaction', error);
  });
});
