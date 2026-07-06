import { createTestUser } from '../../../../../test/factories/user.factory.js';
import type { UsersService } from '../users.service.js';
import { CreateUserCommand, CreateUserUseCase } from './create-user.use-case.js';

describe('CreateUserUseCase', () => {
  it('delegates user creation to UsersService', async () => {
    const user = createTestUser();
    const usersService = { createUser: vi.fn().mockResolvedValue(user) };
    const useCase = new CreateUserUseCase(usersService as unknown as UsersService);
    const params = { username: 'user', email: 'user@example.com', password: 'password' };

    await expect(useCase.execute(new CreateUserCommand(params))).resolves.toBe(user);
    expect(usersService.createUser).toHaveBeenCalledWith(params);
  });
});
