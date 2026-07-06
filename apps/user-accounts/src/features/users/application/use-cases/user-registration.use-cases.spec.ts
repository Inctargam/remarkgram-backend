import type { ConfigType } from '@nestjs/config';
import type { authConfig } from '../../../../config/auth.config.js';
import type { EmailService } from '../../../notifications/email.service.js';
import { createTestUser } from '../../../../../test/factories/user.factory.js';
import type { UsersRepository } from '../ports/users.repository.js';
import type { UsersService } from '../users.service.js';
import { CreateUserCommand, CreateUserUseCase } from './create-user.use-case.js';
import { RegisterUserCommand, RegisterUserUseCase } from './register-user.use-case.js';
import {
  RegistrationConfirmationCommand,
  RegistrationConfirmationUseCase,
} from './registration-confirmation.use-case.js';
import {
  RegistrationEmailResendingCommand,
  RegistrationEmailResendingUseCase,
} from './registration-email-resending.use-case.js';

describe('user registration use cases', () => {
  it('CreateUserUseCase delegates user creation to UsersService', async () => {
    const user = createTestUser();
    const usersService = { createUser: vi.fn().mockResolvedValue(user) };
    const useCase = new CreateUserUseCase(usersService as unknown as UsersService);
    const params = { username: 'user', email: 'user@example.com', password: 'password' };

    await expect(useCase.execute(new CreateUserCommand(params))).resolves.toBe(user);
    expect(usersService.createUser).toHaveBeenCalledWith(params);
  });
});

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
      passwordRecovery: { code: null, expiration: null },
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
});

describe('RegistrationConfirmationUseCase', () => {
  const usersRepository = {
    getConfirmationInfo: vi.fn<UsersRepository['getConfirmationInfo']>(),
    confirmUser: vi.fn<UsersRepository['confirmUser']>(),
  };
  let useCase: RegistrationConfirmationUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.clearAllMocks();
    usersRepository.confirmUser.mockResolvedValue(true);
    useCase = new RegistrationConfirmationUseCase(usersRepository as unknown as UsersRepository);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('confirms a user with an active code', async () => {
    usersRepository.getConfirmationInfo.mockResolvedValue({
      isConfirmed: false,
      code: 'code',
      expiration: new Date('2026-07-01T13:00:00.000Z'),
    });

    await useCase.execute(new RegistrationConfirmationCommand('code'));

    expect(usersRepository.confirmUser).toHaveBeenCalledWith('code');
  });

  it.each([
    [null, 'Confirmation code is invalid'],
    [
      { isConfirmed: true, code: 'code', expiration: new Date('2026-07-01T13:00:00.000Z') },
      'Email is already confirmed',
    ],
    [
      { isConfirmed: false, code: 'code', expiration: new Date('2026-07-01T11:00:00.000Z') },
      'Confirmation code has expired',
    ],
  ])('rejects invalid confirmation info', async (confirmation, message) => {
    usersRepository.getConfirmationInfo.mockResolvedValue(confirmation);

    await expect(useCase.execute(new RegistrationConfirmationCommand('code'))).rejects.toThrow(message);
    expect(usersRepository.confirmUser).not.toHaveBeenCalled();
  });
});

describe('RegistrationEmailResendingUseCase', () => {
  const usersRepository = {
    findByEmail: vi.fn<UsersRepository['findByEmail']>(),
    updateConfirmationCode: vi.fn<UsersRepository['updateConfirmationCode']>(),
  };
  const emailService = {
    sendConfirmationCode: vi.fn<EmailService['sendConfirmationCode']>(),
  };
  const auth = { confirmationCodeExpiresIn: 24 } as ConfigType<typeof authConfig>;
  let useCase: RegistrationEmailResendingUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.clearAllMocks();
    usersRepository.updateConfirmationCode.mockResolvedValue(true);
    emailService.sendConfirmationCode.mockResolvedValue(undefined);
    useCase = new RegistrationEmailResendingUseCase(
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
        confirmation: { isConfirmed: false, code: 'old-code', expiration: new Date() },
      }),
    );

    await useCase.execute(new RegistrationEmailResendingCommand('user@example.com'));

    const code = emailService.sendConfirmationCode.mock.calls[0][1];
    expect(usersRepository.updateConfirmationCode).toHaveBeenCalledWith({
      email: 'user@example.com',
      code,
      expiration: new Date('2026-07-02T12:00:00.000Z'),
    });
    expect(emailService.sendConfirmationCode.mock.invocationCallOrder[0]).toBeLessThan(
      usersRepository.updateConfirmationCode.mock.invocationCallOrder[0],
    );
  });

  it('rejects an unknown email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute(new RegistrationEmailResendingCommand('user@example.com'))).rejects.toThrow(
      'Email is incorrect',
    );
  });

  it('rejects an already confirmed email', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      createTestUser({
        confirmation: { isConfirmed: true, code: null, expiration: null },
      }),
    );

    await expect(useCase.execute(new RegistrationEmailResendingCommand('user@example.com'))).rejects.toThrow(
      'Email is already confirmed',
    );
  });
});
