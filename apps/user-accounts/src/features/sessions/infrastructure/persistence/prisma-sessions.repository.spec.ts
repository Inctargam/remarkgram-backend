import type { PrismaService } from '../../../../database/prisma.service.js';
import { InvalidUserIdError } from '../../application/errors/sessions.errors.js';
import { PrismaSessionsRepository } from './prisma-sessions.repository.js';

describe('PrismaSessionsRepository', () => {
  const updateMany = vi.fn();
  const deleteMany = vi.fn();
  const prisma = {
    deviceSession: { updateMany, deleteMany },
  };
  const repository = new PrismaSessionsRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
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
        userId: '1',
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

  it('deletes current session only when user, session and jti match', async () => {
    const auth = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    };
    deleteMany.mockResolvedValue({ count: 1 });

    await expect(repository.deleteCurrentSession(auth)).resolves.toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: auth.sessionId,
        userId: 1,
        jti: auth.jti,
      },
    });
  });

  it('reports already absent current session as not deleted', async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.deleteCurrentSession({
        userId: '1',
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        jti: 'jti',
      }),
    ).resolves.toBe(false);
  });

  it('deletes selected user session only when user and session match', async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    await expect(repository.deleteUserSession('1', 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24')).resolves.toBe(
      true,
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
        userId: 1,
      },
    });
  });

  it('reports selected user session as not deleted when it is absent', async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.deleteUserSession('1', 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24')).resolves.toBe(
      false,
    );
  });

  it('deletes all user sessions except current one', async () => {
    deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      repository.deleteOtherUserSessions('1', 'e3637e61-194b-4f79-9676-e59a20bb7c42'),
    ).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        id: { not: 'e3637e61-194b-4f79-9676-e59a20bb7c42' },
      },
    });
  });

  it('rejects deleting other sessions when user id is invalid', async () => {
    await expect(
      repository.deleteOtherUserSessions('invalid-user-id', 'e3637e61-194b-4f79-9676-e59a20bb7c42'),
    ).rejects.toThrow(InvalidUserIdError);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('deletes all user sessions', async () => {
    deleteMany.mockResolvedValue({ count: 3 });

    await expect(repository.deleteAllUserSessions('1')).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
      },
    });
  });

  it('deletes all user sessions with transaction client', async () => {
    const txDeleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const tx = {
      deviceSession: {
        deleteMany: txDeleteMany,
      },
    };

    await expect(repository.deleteAllUserSessions('1', tx as never)).resolves.toBe(3);
    expect(txDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
      },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('rejects deleting all sessions when user id is invalid', async () => {
    await expect(repository.deleteAllUserSessions('invalid-user-id')).rejects.toThrow(InvalidUserIdError);
    expect(deleteMany).not.toHaveBeenCalled();
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
