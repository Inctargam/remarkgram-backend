import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserNotFoundError } from '../errors/users.errors.js';
import type { UsersQueryRepository } from '../ports/users-query.repository.js';
import { GetMyProfileHandler, GetMyProfileQuery } from './get-my-profile.query-handler.js';

describe(GetMyProfileHandler.name, () => {
  const findMyProfileByUserId = vi.fn<UsersQueryRepository['findMyProfileByUserId']>();
  const handler = new GetMyProfileHandler({ findMyProfileByUserId } as unknown as UsersQueryRepository);

  beforeEach(() => vi.clearAllMocks());

  it('returns the private profile from the query repository', async () => {
    const profile = {
      userId: 42,
      username: 'username',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      aboutMe: 'About me',
      countryCode: 'UA',
      city: 'Kyiv',
      avatarFileId: 'avatar-id',
    };
    findMyProfileByUserId.mockResolvedValue(profile);

    await expect(handler.execute(new GetMyProfileQuery(42))).resolves.toBe(profile);
    expect(findMyProfileByUserId).toHaveBeenCalledOnce();
    expect(findMyProfileByUserId).toHaveBeenCalledWith(42);
  });

  it('throws UserNotFoundError when the active user is absent', async () => {
    findMyProfileByUserId.mockResolvedValue(null);

    await expect(handler.execute(new GetMyProfileQuery(42))).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('propagates a query repository error', async () => {
    const error = new Error('database unavailable');
    findMyProfileByUserId.mockRejectedValue(error);

    await expect(handler.execute(new GetMyProfileQuery(42))).rejects.toBe(error);
  });
});
