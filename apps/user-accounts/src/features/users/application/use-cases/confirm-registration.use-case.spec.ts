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
    usersRepository.confirmUser.mockResolvedValue({
      wasConfirmed: true,
      checkedAt: new Date('2026-07-01T12:00:00.000Z'),
    });
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
  ])('rejects invalid confirmation info', async (confirmation, message) => {
    usersRepository.getConfirmationInfo.mockResolvedValue(confirmation);

    await expect(useCase.execute(new ConfirmRegistrationCommand('code'))).rejects.toThrow(message);
    expect(usersRepository.confirmUser).not.toHaveBeenCalled();
  });

  it.each([
    ConfirmationInfo.pending('code', new Date('2026-07-01T11:00:00.000Z')),
    ConfirmationInfo.pending('code', new Date('2026-07-01T12:00:00.000Z')),
  ])('rejects an expired code after the atomic update declines it', async (confirmation) => {
    usersRepository.getConfirmationInfo.mockResolvedValue(confirmation);
    usersRepository.confirmUser.mockResolvedValue({
      wasConfirmed: false,
      checkedAt: new Date('2026-07-01T12:00:00.000Z'),
    });

    await expect(useCase.execute(new ConfirmRegistrationCommand('code'))).rejects.toThrow(
      'Confirmation code has expired',
    );
    expect(usersRepository.confirmUser).toHaveBeenCalledWith('code');
  });

  it('uses the database check timestamp when another request confirms the registration first', async () => {
    usersRepository.getConfirmationInfo.mockResolvedValue(
      ConfirmationInfo.pending('code', new Date('2026-07-01T13:00:00.000Z')),
    );
    usersRepository.confirmUser.mockResolvedValue({
      wasConfirmed: false,
      checkedAt: new Date('2026-07-01T12:00:00.000Z'),
    });
    vi.setSystemTime(new Date('2026-07-01T14:00:00.000Z'));

    await expect(useCase.execute(new ConfirmRegistrationCommand('code'))).rejects.toThrow(
      'Email is already confirmed',
    );
    expect(usersRepository.confirmUser).toHaveBeenCalledWith('code');
  });
});
