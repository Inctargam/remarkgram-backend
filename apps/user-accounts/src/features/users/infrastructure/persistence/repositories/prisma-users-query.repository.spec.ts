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
});
