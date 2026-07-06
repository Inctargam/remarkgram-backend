import { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import type { UsersRepository } from '../ports/users.repository.js';
import { ConfirmRegistrationCommand, ConfirmRegistrationUseCase } from './confirm-registration.use-case.js';

describe('ConfirmRegistrationUseCase', () => {
  const usersRepository = {
    getConfirmationInfo: vi.fn<UsersRepository['getConfirmationInfo']>(),
    confirmUser: vi.fn<UsersRepository['confirmUser']>(),
  };
  let useCase: ConfirmRegistrationUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.clearAllMocks();
    usersRepository.confirmUser.mockResolvedValue(true);
    useCase = new ConfirmRegistrationUseCase(usersRepository as unknown as UsersRepository);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('confirms a user with an active code', async () => {
    usersRepository.getConfirmationInfo.mockResolvedValue(
      ConfirmationInfo.pending('code', new Date('2026-07-01T13:00:00.000Z')),
    );

    await useCase.execute(new ConfirmRegistrationCommand('code'));

    expect(usersRepository.confirmUser).toHaveBeenCalledWith('code');
  });

  it.each([
    [null, 'Confirmation code is invalid'],
    [ConfirmationInfo.confirmed(), 'Email is already confirmed'],
    [ConfirmationInfo.pending('code', new Date('2026-07-01T11:00:00.000Z')), 'Confirmation code has expired'],
    [ConfirmationInfo.pending('code', new Date('2026-07-01T12:00:00.000Z')), 'Confirmation code has expired'],
  ])('rejects invalid confirmation info', async (confirmation, message) => {
    usersRepository.getConfirmationInfo.mockResolvedValue(confirmation);

    await expect(useCase.execute(new ConfirmRegistrationCommand('code'))).rejects.toThrow(message);
    expect(usersRepository.confirmUser).not.toHaveBeenCalled();
  });

  it('throws when another request confirms the registration first', async () => {
    usersRepository.getConfirmationInfo.mockResolvedValue(
      ConfirmationInfo.pending('code', new Date('2026-07-01T13:00:00.000Z')),
    );
    usersRepository.confirmUser.mockResolvedValue(false);

    await expect(useCase.execute(new ConfirmRegistrationCommand('code'))).rejects.toThrow(
      'Email is already confirmed',
    );
    expect(usersRepository.confirmUser).toHaveBeenCalledWith('code');
  });
});
