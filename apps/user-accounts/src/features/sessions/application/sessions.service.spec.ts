import type { SessionsRepository } from './ports/sessions.repository.js';
import { SessionsService } from './sessions.service.js';

describe('SessionsService', () => {
  const sessionsRepository = {
    createSession: vi.fn<SessionsRepository['createSession']>(),
    rotateRefreshToken: vi.fn<SessionsRepository['rotateRefreshToken']>(),
    isSessionActive: vi.fn<SessionsRepository['isSessionActive']>(),
    getSessionOwner: vi.fn<SessionsRepository['getSessionOwner']>(),
    revokeCurrentSession: vi.fn<SessionsRepository['revokeCurrentSession']>(),
    revokeUserSession: vi.fn<SessionsRepository['revokeUserSession']>(),
    revokeOtherUserSessions: vi.fn<SessionsRepository['revokeOtherUserSessions']>(),
    revokeAllUserSessions: vi.fn<SessionsRepository['revokeAllUserSessions']>(),
  };
  let service: SessionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionsService(sessionsRepository);
  });

  it('creates a session without deleting an existing record', async () => {
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
    sessionsRepository.createSession.mockResolvedValue(true);

    await expect(service.createSession(params)).resolves.toBe(true);

    expect(sessionsRepository.createSession).toHaveBeenCalledWith(params);
  });

  it('rotates the refresh token for an existing session', async () => {
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
    sessionsRepository.rotateRefreshToken.mockResolvedValue(true);

    await expect(service.rotateRefreshToken(params)).resolves.toBeUndefined();
    expect(sessionsRepository.rotateRefreshToken).toHaveBeenCalledWith(params);
  });

  it('rejects rotation with a stale refresh token', async () => {
    sessionsRepository.rotateRefreshToken.mockResolvedValue(false);

    await expect(
      service.rotateRefreshToken({
        userId: '1',
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        currentJti: 'stale-jti',
        newJti: 'new-jti',
        deviceName: 'Browser',
        ip: '127.0.0.1',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        expiresAt: new Date('2026-07-02T12:00:00.000Z'),
      }),
    ).rejects.toThrow('No active session found');
  });

  it('revokes the current session', async () => {
    const params = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
      reason: 'USER_LOGOUT' as const,
    };
    sessionsRepository.revokeCurrentSession.mockResolvedValue(true);

    await expect(service.revokeCurrentSession(params)).resolves.toBe(true);
    expect(sessionsRepository.revokeCurrentSession).toHaveBeenCalledWith(params);
  });

  it('revokes a selected user session', async () => {
    const params = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      reason: 'USER_LOGOUT' as const,
    };
    sessionsRepository.revokeUserSession.mockResolvedValue(true);

    await expect(service.revokeUserSession(params)).resolves.toBe(true);
    expect(sessionsRepository.revokeUserSession).toHaveBeenCalledWith(params);
  });

  it('revokes other user sessions', async () => {
    const params = {
      userId: '1',
      currentSessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      reason: 'LOGOUT_ALL' as const,
    };
    sessionsRepository.revokeOtherUserSessions.mockResolvedValue(2);

    await expect(service.revokeOtherUserSessions(params)).resolves.toBe(2);
    expect(sessionsRepository.revokeOtherUserSessions).toHaveBeenCalledWith(params);
  });

  it('revokes all user sessions', async () => {
    const params = {
      userId: '1',
      reason: 'PASSWORD_CHANGED' as const,
    };
    sessionsRepository.revokeAllUserSessions.mockResolvedValue(3);

    await expect(service.revokeAllUserSessions(params)).resolves.toBe(3);
    expect(sessionsRepository.revokeAllUserSessions).toHaveBeenCalledWith(params, undefined);
  });

  it('checks session ownership', async () => {
    sessionsRepository.getSessionOwner.mockResolvedValue('1');

    await expect(
      service.assertSessionOwnership('1', 'e3637e61-194b-4f79-9676-e59a20bb7c42'),
    ).resolves.toBeUndefined();
  });

  it('rejects access to another user session', async () => {
    sessionsRepository.getSessionOwner.mockResolvedValue('2');

    await expect(service.assertSessionOwnership('1', 'e3637e61-194b-4f79-9676-e59a20bb7c42')).rejects.toThrow(
      'Access denied',
    );
  });
});
