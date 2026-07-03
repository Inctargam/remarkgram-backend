import type { ConfigType } from '@nestjs/config';
import type { authConfig } from '../../../config/auth.config.js';
import type { AuthService } from '../../auth/application/auth.service.js';
import type { EmailService } from '../../notifications/email.service.js';
import { createTestUser } from '../../../../test/factories/user.factory.js';
import type { UsersRepository } from './ports/users.repository.js';
import type { CreateUserRepositoryParams } from './types/users.types.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const usersRepository = {
    isUsernameExists: vi.fn<UsersRepository['isUsernameExists']>(),
    isEmailExists: vi.fn<UsersRepository['isEmailExists']>(),
    create: vi.fn<UsersRepository['create']>(),
  };
  const authService = {
    hashPassword: vi.fn<AuthService['hashPassword']>(),
  };
  const emailService = {
    sendConfirmationCode: vi.fn<EmailService['sendConfirmationCode']>(),
  };
  const auth = {
    confirmationCodeExpiresIn: 24,
  } as ConfigType<typeof authConfig>;

  let service: UsersService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.clearAllMocks();
    usersRepository.isUsernameExists.mockResolvedValue(false);
    usersRepository.isEmailExists.mockResolvedValue(false);
    authService.hashPassword.mockResolvedValue('password-hash');
    usersRepository.create.mockImplementation((params: CreateUserRepositoryParams) =>
      Promise.resolve(
        createTestUser({
          username: params.username,
          email: params.email,
          hash: params.hash,
          createdAt: params.createdAt,
          confirmation: params.confirmation,
          passwordRecovery: params.passwordRecovery,
        }),
      ),
    );

    service = new UsersService(
      usersRepository as unknown as UsersRepository,
      authService as unknown as AuthService,
      emailService as unknown as EmailService,
      auth,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an already confirmed user', async () => {
    const user = await service.createUser({
      username: 'user',
      email: 'user@example.com',
      password: 'password',
    });

    expect(authService.hashPassword).toHaveBeenCalledWith('password');
    expect(usersRepository.create).toHaveBeenCalledWith({
      username: 'user',
      email: 'user@example.com',
      hash: 'password-hash',
      createdAt: new Date('2026-07-01T12:00:00.000Z'),
      confirmation: { isConfirmed: true, code: null, expiration: null },
      passwordRecovery: { code: null, expiration: null },
    });
    expect(user.username).toBe('user');
  });

  it('rejects an existing username before hashing the password', async () => {
    usersRepository.isUsernameExists.mockResolvedValue(true);

    await expect(
      service.createUser({ username: 'user', email: 'user@example.com', password: 'password' }),
    ).rejects.toThrow('Username already exists');
    expect(authService.hashPassword).not.toHaveBeenCalled();
  });

  it('registers an unconfirmed user and sends its confirmation code', async () => {
    await service.registerUser({
      username: 'user',
      email: 'user@example.com',
      password: 'password',
    });

    const createParams = usersRepository.create.mock.calls[0][0];
    expect(typeof createParams.confirmation.code).toBe('string');
    expect(createParams.confirmation).toEqual({
      isConfirmed: false,
      code: createParams.confirmation.code,
      expiration: new Date('2026-07-02T12:00:00.000Z'),
    });
    expect(emailService.sendConfirmationCode).toHaveBeenCalledWith(
      'user@example.com',
      createParams.confirmation.code,
    );
  });
});
