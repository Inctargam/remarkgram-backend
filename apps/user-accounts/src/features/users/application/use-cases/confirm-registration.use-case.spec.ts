import type { UsersRepository } from '../ports/users.repository.js';
import { ConfirmRegistrationCommand, ConfirmRegistrationUseCase } from './confirm-registration.use-case.js';

describe('ConfirmRegistrationUseCase', () => {
  const usersRepository = {
    confirmUser: vi.fn<UsersRepository['confirmUser']>(),
  };
  let useCase: ConfirmRegistrationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    usersRepository.confirmUser.mockResolvedValue(true);
    useCase = new ConfirmRegistrationUseCase(usersRepository as unknown as UsersRepository);
  });

  it('confirms a user with an active code', async () => {
    await useCase.execute(new ConfirmRegistrationCommand('code'));

    expect(usersRepository.confirmUser).toHaveBeenCalledWith('code');
  });

  it('returns a generic error when the user was not confirmed', async () => {
    usersRepository.confirmUser.mockResolvedValue(false);

    await expect(useCase.execute(new ConfirmRegistrationCommand('code'))).rejects.toThrow(
      'Confirmation code is invalid',
    );
    expect(usersRepository.confirmUser).toHaveBeenCalledWith('code');
  });
});
