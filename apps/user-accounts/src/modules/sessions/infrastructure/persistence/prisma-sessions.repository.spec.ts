import type { PrismaService } from '../../../../database/prisma.service.js';
import { PrismaSessionsRepository } from './prisma-sessions.repository.js';

describe('PrismaSessionsRepository', () => {
  const updateMany = vi.fn();
  const prisma = {
    deviceSession: { updateMany },
  };
  const repository = new PrismaSessionsRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atomically rotates a refresh token only when the current jti matches', async () => {
    const params = {
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      currentJti: 'old-jti',
      newJti: 'new-jti',
      deviceName: 'Browser',
      ip: '127.0.0.1',
      lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
      expiresAt: new Date('2026-07-02T12:00:00.000Z'),
    };
    updateMany.mockResolvedValue({ count: 1 });

    await expect(repository.rotateRefreshToken(params)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: params.sessionId,
        jti: params.currentJti,
      },
      data: {
        jti: params.newJti,
        deviceName: params.deviceName,
        ip: params.ip,
        lastActiveAt: params.lastActiveAt,
        expiresAt: params.expiresAt,
      },
    });
  });

  it('reports a stale refresh token when no session was updated', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.rotateRefreshToken({
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        currentJti: 'stale-jti',
        newJti: 'new-jti',
        deviceName: 'Browser',
        ip: '127.0.0.1',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        expiresAt: new Date('2026-07-02T12:00:00.000Z'),
      }),
    ).resolves.toBe(false);
  });
});
