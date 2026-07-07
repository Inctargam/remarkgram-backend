import type { ConfigType } from '@nestjs/config';
import type { authConfig } from '../../../../config/auth.config.js';
import type { EmailService } from '../../../notifications/email.service.js';
import { createTestUser } from '../../../../../test/factories/user.factory.js';
import { PasswordRecoveryInfo } from '../../domain/value-objects/password-recovery-info.js';
import type { UsersRepository } from '../ports/users.repository.js';
import type { UsersService } from '../users.service.js';
import { RegisterUserCommand, RegisterUserUseCase } from './register-user.use-case.js';

describe('RegisterUserUseCase', () => {
  const usersRepository = {
    releaseExpiredRegistrationCredentials: vi.fn<UsersRepository['releaseExpiredRegistrationCredentials']>(),
  };
  const usersService = {
    createUser: vi.fn<UsersService['createUser']>(),
  };
  const emailService = {
    sendConfirmationCode: vi.fn<EmailService['sendConfirmationCode']>(),
  };
  const auth = { confirmationCodeExpiresIn: 24 } as ConfigType<typeof authConfig>;
  let useCase: RegisterUserUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.clearAllMocks();
    usersRepository.releaseExpiredRegistrationCredentials.mockResolvedValue(undefined);
    usersService.createUser.mockResolvedValue(createTestUser());
    emailService.sendConfirmationCode.mockResolvedValue(undefined);
    useCase = new RegisterUserUseCase(
      usersRepository as unknown as UsersRepository,
      usersService as unknown as UsersService,
      emailService as unknown as EmailService,
      auth,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an unconfirmed user and sends its confirmation code', async () => {
    await useCase.execute(
      new RegisterUserCommand({
        username: 'user',
        email: 'user@example.com',
        password: 'password',
      }),
    );

    expect(usersRepository.releaseExpiredRegistrationCredentials).toHaveBeenCalledWith({
      username: 'user',
      email: 'user@example.com',
      now: new Date('2026-07-01T12:00:00.000Z'),
    });
    const createParams = usersService.createUser.mock.calls[0][0];
    expect(typeof createParams.confirmation?.code).toBe('string');
    expect(createParams).toEqual({
      username: 'user',
      email: 'user@example.com',
      password: 'password',
      confirmation: {
        isConfirmed: false,
        code: createParams.confirmation?.code,
        expiration: new Date('2026-07-02T12:00:00.000Z'),
      },
      passwordRecovery: PasswordRecoveryInfo.inactive(),
    });
    expect(emailService.sendConfirmationCode).toHaveBeenCalledWith(
      'user@example.com',
      createParams.confirmation?.code,
    );
    expect(usersRepository.releaseExpiredRegistrationCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      usersService.createUser.mock.invocationCallOrder[0],
    );
    expect(usersService.createUser.mock.invocationCallOrder[0]).toBeLessThan(
      emailService.sendConfirmationCode.mock.invocationCallOrder[0],
    );
  });

  it('propagates confirmation email delivery errors', async () => {
    const error = new Error('SMTP unavailable');
    emailService.sendConfirmationCode.mockRejectedValue(error);

    await expect(
      useCase.execute(
        new RegisterUserCommand({
          username: 'user',
          email: 'user@example.com',
          password: 'password',
        }),
      ),
    ).rejects.toBe(error);

    expect(usersService.createUser).toHaveBeenCalledOnce();
  });
});
