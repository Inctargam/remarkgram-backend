import type { PrismaService } from '../../../../database/prisma.service.js';
import { InvalidUserIdError } from '../../application/errors/sessions.errors.js';
import { PrismaSessionsRepository } from './prisma-sessions.repository.js';

describe('PrismaSessionsRepository', () => {
  const updateMany = vi.fn();
  const executeRaw = vi.fn();
  const prisma = {
    deviceSession: { updateMany },
    $executeRaw: executeRaw,
  };
  const repository = new PrismaSessionsRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session only while the password hash remains unchanged', async () => {
    const params = {
      userId: '1',
      expectedPasswordHash: 'password-hash',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      deviceName: 'Browser',
      ip: '127.0.0.1',
      jti: 'jti',
      lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
      expiresAt: new Date('2026-07-02T12:00:00.000Z'),
    };
    executeRaw.mockResolvedValue(1);

    await expect(repository.createSession(params)).resolves.toBe(true);
    expect(executeRaw).toHaveBeenCalledOnce();
    const sql = (executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('FOR NO KEY UPDATE');
    expect(sql).not.toContain('MATERIALIZED');
    expect(executeRaw.mock.calls[0].slice(1)).toEqual([
      params.sessionId,
      params.deviceName,
      params.ip,
      params.jti,
      params.lastActiveAt,
      params.expiresAt,
      1,
      params.expectedPasswordHash,
    ]);
  });

  it('does not create a session after the password hash changes', async () => {
    executeRaw.mockResolvedValue(0);

    await expect(
      repository.createSession({
        userId: '1',
        expectedPasswordHash: 'stale-password-hash',
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        deviceName: 'Browser',
        ip: '127.0.0.1',
        jti: 'jti',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        expiresAt: new Date('2026-07-02T12:00:00.000Z'),
      }),
    ).resolves.toBe(false);
  });

  it('atomically rotates a refresh token only when the current jti matches', async () => {
    const params = {
      userId: '1',
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
        userId: 1,
        jti: params.currentJti,
        revokedAt: null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expiresAt: { gt: expect.any(Date) },
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

  it('revokes an active session when refresh token reuse is detected', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const params = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      currentJti: 'stale-jti',
      newJti: 'new-jti',
      deviceName: 'Browser',
      ip: '127.0.0.1',
      lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
      expiresAt: new Date('2026-07-02T12:00:00.000Z'),
    };

    await expect(repository.rotateRefreshToken(params)).resolves.toBe(false);
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: params.sessionId,
        userId: 1,
        revokedAt: null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expiresAt: { gt: expect.any(Date) },
        NOT: { jti: params.currentJti },
      },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revokedAt: expect.any(Date),
        revokedReason: 'TOKEN_REUSE_DETECTED',
      },
    });
  });

  it('revokes current session only when user, session and jti match', async () => {
    const params = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
      reason: 'USER_LOGOUT' as const,
    };
    updateMany.mockResolvedValue({ count: 1 });

    await expect(repository.revokeCurrentSession(params)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: params.sessionId,
        userId: 1,
        jti: params.jti,
        revokedAt: null,
      },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revokedAt: expect.any(Date),
        revokedReason: 'USER_LOGOUT',
      },
    });
  });

  it('reports already absent current session as not revoked', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.revokeCurrentSession({
        userId: '1',
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        jti: 'jti',
        reason: 'USER_LOGOUT',
      }),
    ).resolves.toBe(false);
  });

  it('revokes selected user session only when user and session match', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.revokeUserSession({
        userId: '1',
        sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
        reason: 'USER_LOGOUT',
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
        userId: 1,
        revokedAt: null,
      },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revokedAt: expect.any(Date),
        revokedReason: 'USER_LOGOUT',
      },
    });
  });

  it('reports selected user session as not revoked when it is absent', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.revokeUserSession({
        userId: '1',
        sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
        reason: 'USER_LOGOUT',
      }),
    ).resolves.toBe(false);
  });

  it('revokes all user sessions except current one', async () => {
    updateMany.mockResolvedValue({ count: 2 });

    await expect(
      repository.revokeOtherUserSessions({
        userId: '1',
        currentSessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        reason: 'LOGOUT_ALL',
      }),
    ).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        id: { not: 'e3637e61-194b-4f79-9676-e59a20bb7c42' },
        revokedAt: null,
      },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revokedAt: expect.any(Date),
        revokedReason: 'LOGOUT_ALL',
      },
    });
  });

  it('rejects revoking other sessions when user id is invalid', async () => {
    await expect(
      repository.revokeOtherUserSessions({
        userId: 'invalid-user-id',
        currentSessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        reason: 'LOGOUT_ALL',
      }),
    ).rejects.toThrow(InvalidUserIdError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('revokes all user sessions', async () => {
    updateMany.mockResolvedValue({ count: 3 });

    await expect(
      repository.revokeAllUserSessions({
        userId: '1',
        reason: 'PASSWORD_CHANGED',
      }),
    ).resolves.toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        revokedAt: null,
      },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revokedAt: expect.any(Date),
        revokedReason: 'PASSWORD_CHANGED',
      },
    });
  });

  it('revokes all user sessions with transaction client', async () => {
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const tx = {
      deviceSession: {
        updateMany: txUpdateMany,
      },
    };

    await expect(
      repository.revokeAllUserSessions(
        {
          userId: '1',
          reason: 'PASSWORD_CHANGED',
        },
        tx as never,
      ),
    ).resolves.toBe(3);
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        revokedAt: null,
      },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revokedAt: expect.any(Date),
        revokedReason: 'PASSWORD_CHANGED',
      },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects revoking all sessions when user id is invalid', async () => {
    await expect(
      repository.revokeAllUserSessions({
        userId: 'invalid-user-id',
        reason: 'PASSWORD_CHANGED',
      }),
    ).rejects.toThrow(InvalidUserIdError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', ''])('throws on invalid userId in rotateRefreshToken', async (userId) => {
    await expect(
      repository.rotateRefreshToken({
        userId,
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        currentJti: 'jti',
        newJti: 'new-jti',
        deviceName: 'Browser',
        ip: '127.0.0.1',
        lastActiveAt: new Date(),
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(InvalidUserIdError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', ''])('throws on invalid userId in isSessionActive', async (userId) => {
    const findFirst = vi.fn();
    const prismaWithFindFirst = { deviceSession: { updateMany, findFirst } };
    const repo = new PrismaSessionsRepository(prismaWithFindFirst as unknown as PrismaService);

    await expect(
      repo.isSessionActive({
        userId,
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        jti: 'jti',
      }),
    ).rejects.toThrow(InvalidUserIdError);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
