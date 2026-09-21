import type { PrismaService } from '../../../../../database/prisma.service.js';
import { PrismaUsersQueryRepository } from './prisma-users-query.repository.js';

describe(PrismaUsersQueryRepository.name, () => {
  const findFirst = vi.fn();
  const prisma = { user: { findFirst } };
  const repository = new PrismaUsersQueryRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current user with password and OAuth login information', async () => {
    const createdAt = new Date('2026-08-21T10:15:00.000Z');
    findFirst.mockResolvedValue({
      id: 42,
      username: 'client123',
      email: 'user@example.com',
      isConfirmed: true,
      hash: 'password-hash',
      createdAt,
      providers: [{ provider: 'google' }, { provider: 'github' }],
    });

    await expect(repository.findCurrentById(42)).resolves.toEqual({
      id: 42,
      username: 'client123',
      email: 'user@example.com',
      emailVerified: true,
      hasPassword: true,
      oauthProviders: ['google', 'github'],
      createdAt,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 42, deletedAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        isConfirmed: true,
        hash: true,
        createdAt: true,
        providers: { select: { provider: true } },
      },
    });
  });

  it('reports an OAuth-only account without exposing provider profile data', async () => {
    findFirst.mockResolvedValue({
      id: 7,
      username: 'client7',
      email: 'oauth@example.com',
      isConfirmed: true,
      hash: null,
      createdAt: new Date('2026-08-21T10:15:00.000Z'),
      providers: [{ provider: 'github' }],
    });

    await expect(repository.findCurrentById(7)).resolves.toEqual(
      expect.objectContaining({
        hasPassword: false,
        oauthProviders: ['github'],
      }),
    );
  });

  it('returns null when an active user is not found', async () => {
    findFirst.mockResolvedValue(null);

    await expect(repository.findCurrentById(42)).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42, deletedAt: null } }));
  });

  it('maps the profile birth date to an ISO calendar date', async () => {
    findFirst.mockResolvedValue({
      id: 42,
      username: 'client123',
      profile: {
        firstName: 'Ivan',
        lastName: 'Ivanov',
        aboutMe: null,
        avatarFileId: null,
        city: 'Kyiv',
        countryCode: 'UA',
        dateOfBirth: new Date('1990-01-15T00:00:00.000Z'),
      },
    });

    await expect(repository.findMyProfileByUserId(42)).resolves.toEqual(
      expect.objectContaining({ dateOfBirth: '1990-01-15' }),
    );
  });

  it('maps every private profile field and filters out soft-deleted users', async () => {
    findFirst.mockResolvedValue({
      id: 42,
      username: 'client123',
      profile: {
        firstName: 'Ivan',
        lastName: 'Ivanov',
        aboutMe: 'About me',
        avatarFileId: 'avatar-id',
        city: 'Kyiv',
        countryCode: 'UA',
        dateOfBirth: new Date('1990-01-15T00:00:00.000Z'),
      },
    });

    await expect(repository.findMyProfileByUserId(42)).resolves.toEqual({
      userId: 42,
      username: 'client123',
      firstName: 'Ivan',
      lastName: 'Ivanov',
      aboutMe: 'About me',
      avatarFileId: 'avatar-id',
      city: 'Kyiv',
      countryCode: 'UA',
      dateOfBirth: '1990-01-15',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 42, deletedAt: null },
      select: { id: true, username: true, profile: true },
    });
  });

  it('returns a private view with null optionals when the user has no Profile row', async () => {
    findFirst.mockResolvedValue({ id: 7, username: 'client7', profile: null });

    await expect(repository.findMyProfileByUserId(7)).resolves.toEqual({
      userId: 7,
      username: 'client7',
      firstName: null,
      lastName: null,
      aboutMe: null,
      avatarFileId: null,
      city: null,
      countryCode: null,
      dateOfBirth: null,
    });
  });

  it('returns a public view without private profile fields', async () => {
    findFirst.mockResolvedValue({
      id: 42,
      username: 'client123',
      profile: {
        firstName: 'Private',
        lastName: 'Name',
        dateOfBirth: new Date('1990-01-15T00:00:00.000Z'),
        city: 'Kyiv',
        countryCode: 'UA',
        aboutMe: 'Public bio',
        avatarFileId: 'avatar-id',
      },
    });

    const result = await repository.findPublicProfileByUserId(42);

    expect(result).toEqual({
      userId: 42,
      username: 'client123',
      aboutMe: 'Public bio',
      avatarFileId: 'avatar-id',
    });
    expect(result).not.toHaveProperty('firstName');
    expect(result).not.toHaveProperty('lastName');
    expect(result).not.toHaveProperty('dateOfBirth');
    expect(result).not.toHaveProperty('city');
    expect(result).not.toHaveProperty('countryCode');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 42, deletedAt: null },
      select: { id: true, username: true, profile: true },
    });
  });

  it('returns public null optionals when the user has no Profile row', async () => {
    findFirst.mockResolvedValue({ id: 7, username: 'client7', profile: null });

    await expect(repository.findPublicProfileByUserId(7)).resolves.toEqual({
      userId: 7,
      username: 'client7',
      aboutMe: null,
      avatarFileId: null,
    });
  });

  it.each(['findMyProfileByUserId', 'findPublicProfileByUserId'] as const)(
    'returns null from %s when the active user is unknown or soft-deleted',
    async (method) => {
      findFirst.mockResolvedValue(null);

      await expect(repository[method](42)).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42, deletedAt: null } }));
    },
  );

  it('propagates a profile query persistence error', async () => {
    const error = new Error('database unavailable');
    findFirst.mockRejectedValue(error);

    await expect(repository.findMyProfileByUserId(42)).rejects.toBe(error);
  });
});
