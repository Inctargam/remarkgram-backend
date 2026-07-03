import type { SessionsRepository } from './ports/sessions.repository.js';
import { SessionsService } from './sessions.service.js';

describe('SessionsService', () => {
  const sessionsRepository = {
    createSession: vi.fn<SessionsRepository['createSession']>(),
    rotateRefreshToken: vi.fn<SessionsRepository['rotateRefreshToken']>(),
    isSessionActive: vi.fn<SessionsRepository['isSessionActive']>(),
    getSessionOwner: vi.fn<SessionsRepository['getSessionOwner']>(),
  };
  let service: SessionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionsService(sessionsRepository);
  });

  it('creates a session without deleting an existing record', async () => {
    const params = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      deviceName: 'Browser',
      ip: '127.0.0.1',
      jti: 'jti',
      lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
      expiresAt: new Date('2026-07-02T12:00:00.000Z'),
    };
    sessionsRepository.createSession.mockResolvedValue(undefined);

    await service.createSession(params);

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
