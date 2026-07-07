import type { PrismaService } from '../../../../database/prisma.service.js';
import { PrismaSessionsQueryRepository } from './prisma-sessions-query.repository.js';

describe('PrismaSessionsQueryRepository', () => {
  const findMany = vi.fn();
  const prisma = { deviceSession: { findMany } };
  const repository = new PrismaSessionsQueryRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only unexpired sessions and marks the current session', async () => {
    const currentSessionId = 'e3637e61-194b-4f79-9676-e59a20bb7c42';
    findMany.mockResolvedValue([
      {
        id: currentSessionId,
        userId: 1,
        deviceName: 'Current browser',
        ip: '127.0.0.1',
        jti: 'current-jti',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        expiresAt: new Date('2026-07-08T12:00:00.000Z'),
      },
      {
        id: '7a63d7e0-9ae7-4e5b-84e4-d770bdb5ef92',
        userId: 1,
        deviceName: 'Other browser',
        ip: '127.0.0.2',
        jti: 'other-jti',
        lastActiveAt: new Date('2026-07-01T11:00:00.000Z'),
        expiresAt: new Date('2026-07-08T11:00:00.000Z'),
      },
    ]);

    await expect(repository.getActiveSessions('1', currentSessionId)).resolves.toEqual([
      {
        ip: '127.0.0.1',
        deviceName: 'Current browser',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        sessionId: currentSessionId,
        isCurrent: true,
      },
      {
        ip: '127.0.0.2',
        deviceName: 'Other browser',
        lastActiveAt: new Date('2026-07-01T11:00:00.000Z'),
        sessionId: '7a63d7e0-9ae7-4e5b-84e4-d770bdb5ef92',
        isCurrent: false,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        expiresAt: { gt: expect.any(Date) as Date },
      },
    });
  });
});
