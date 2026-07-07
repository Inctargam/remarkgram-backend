import type { ConfigType } from '@nestjs/config';
import type { authConfig } from '../../../../config/auth.config.js';
import type { EmailService } from '../../../notifications/email.service.js';
import { createTestUser } from '../../../../../test/factories/user.factory.js';
import { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import type { UsersRepository } from '../ports/users.repository.js';
import {
  ResendRegistrationConfirmationCommand,
  ResendRegistrationConfirmationUseCase,
} from './resend-registration-confirmation.use-case.js';

describe('ResendRegistrationConfirmationUseCase', () => {
  const usersRepository = {
    findByEmail: vi.fn<UsersRepository['findByEmail']>(),
    updateConfirmationCode: vi.fn<UsersRepository['updateConfirmationCode']>(),
  };
  const emailService = {
    sendConfirmationCode: vi.fn<EmailService['sendConfirmationCode']>(),
  };
  const auth = { confirmationCodeExpiresIn: 24 } as ConfigType<typeof authConfig>;
  let useCase: ResendRegistrationConfirmationUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.clearAllMocks();
    usersRepository.updateConfirmationCode.mockResolvedValue(true);
    emailService.sendConfirmationCode.mockResolvedValue(undefined);
    useCase = new ResendRegistrationConfirmationUseCase(
      usersRepository as unknown as UsersRepository,
      emailService as unknown as EmailService,
      auth,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends and persists a new confirmation code', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      createTestUser({
        confirmation: ConfirmationInfo.pending('old-code', new Date()),
      }),
    );

    await useCase.execute(new ResendRegistrationConfirmationCommand('user@example.com'));

    const code = emailService.sendConfirmationCode.mock.calls[0][1];
    expect(usersRepository.updateConfirmationCode).toHaveBeenCalledWith({
      userId: 1,
      expectedCode: 'old-code',
      newCode: code,
      expiration: new Date('2026-07-02T12:00:00.000Z'),
    });
    expect(usersRepository.updateConfirmationCode.mock.invocationCallOrder[0]).toBeLessThan(
      emailService.sendConfirmationCode.mock.invocationCallOrder[0],
    );
  });

  it('rejects an unknown email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute(new ResendRegistrationConfirmationCommand('user@example.com')),
    ).rejects.toThrow('Email is incorrect');
  });

  it('rejects an already confirmed email', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      createTestUser({
        confirmation: ConfirmationInfo.confirmed(),
      }),
    );

    await expect(
      useCase.execute(new ResendRegistrationConfirmationCommand('user@example.com')),
    ).rejects.toThrow('Email is already confirmed');
  });

  it('completes without sending email when a concurrent request has already changed the code', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      createTestUser({
        confirmation: ConfirmationInfo.pending('old-code', new Date()),
      }),
    );
    usersRepository.updateConfirmationCode.mockResolvedValue(false);

    await expect(
      useCase.execute(new ResendRegistrationConfirmationCommand('user@example.com')),
    ).resolves.toBeUndefined();
    expect(emailService.sendConfirmationCode).not.toHaveBeenCalled();
  });
});
