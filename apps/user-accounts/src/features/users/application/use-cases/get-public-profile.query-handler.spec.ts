import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserNotFoundError } from '../errors/users.errors.js';
import type { UsersQueryRepository } from '../ports/users-query.repository.js';
import { GetPublicProfileHandler, GetPublicProfileQuery } from './get-public-profile.query-handler.js';

describe(GetPublicProfileHandler.name, () => {
  const findPublicProfileByUserId = vi.fn<UsersQueryRepository['findPublicProfileByUserId']>();
  const handler = new GetPublicProfileHandler({
    findPublicProfileByUserId,
  } as unknown as UsersQueryRepository);

  beforeEach(() => vi.clearAllMocks());

  it('returns only the public profile view from the query repository', async () => {
    const profile = {
      userId: 42,
      username: 'username',
      aboutMe: 'About me',
      avatarFileId: 'avatar-id',
    };
    findPublicProfileByUserId.mockResolvedValue(profile);

    await expect(handler.execute(new GetPublicProfileQuery(42))).resolves.toBe(profile);
    expect(findPublicProfileByUserId).toHaveBeenCalledOnce();
    expect(findPublicProfileByUserId).toHaveBeenCalledWith(42);
  });

  it('throws UserNotFoundError when the active user is absent', async () => {
    findPublicProfileByUserId.mockResolvedValue(null);

    await expect(handler.execute(new GetPublicProfileQuery(42))).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('propagates a query repository error', async () => {
    const error = new Error('database unavailable');
    findPublicProfileByUserId.mockRejectedValue(error);

    await expect(handler.execute(new GetPublicProfileQuery(42))).rejects.toBe(error);
  });
});
