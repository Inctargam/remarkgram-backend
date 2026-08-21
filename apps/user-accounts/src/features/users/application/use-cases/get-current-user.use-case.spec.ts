import type { UsersQueryRepository } from '../ports/users-query.repository.js';
import { InvalidUserIdError } from '../errors/users.errors.js';
import { GetCurrentUserQuery, GetCurrentUserUseCase } from './get-current-user.use-case.js';

describe(GetCurrentUserUseCase.name, () => {
  const findCurrentById = vi.fn<UsersQueryRepository['findCurrentById']>();
  const repository = { findCurrentById };
  const useCase = new GetCurrentUserUseCase(repository);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current user for a valid token subject', async () => {
    const user = {
      id: 42,
      username: 'client123',
      email: 'user@example.com',
      emailVerified: true,
      hasPassword: true,
      oauthProviders: ['github'] as Array<'github' | 'google'>,
      createdAt: new Date('2026-08-21T10:15:00.000Z'),
    };
    findCurrentById.mockResolvedValue(user);

    await expect(useCase.execute(new GetCurrentUserQuery('42'))).resolves.toBe(user);
    expect(findCurrentById).toHaveBeenCalledWith(42);
  });

  it.each(['', '0', '-1', '1.5', 'not-a-number', String(Number.MAX_SAFE_INTEGER + 1)])(
    'rejects invalid user id %j',
    async (userId) => {
      await expect(useCase.execute(new GetCurrentUserQuery(userId))).rejects.toThrow(InvalidUserIdError);
      expect(findCurrentById).not.toHaveBeenCalled();
    },
  );

  it('rejects a token subject whose user no longer exists', async () => {
    findCurrentById.mockResolvedValue(null);

    await expect(useCase.execute(new GetCurrentUserQuery('42'))).rejects.toThrow(InvalidUserIdError);
  });
});
