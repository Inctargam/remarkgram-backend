import type { SessionsService } from '../sessions.service.js';
import { GetSessionsQuery, GetSessionsUseCase } from './get-sessions.use-case.js';

describe('GetSessionsUseCase', () => {
  it('returns active user sessions', async () => {
    const sessions = [
      {
        ip: '127.0.0.1',
        deviceName: 'Browser',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        isCurrent: true,
      },
    ];
    const repository = { getActiveSessions: vi.fn().mockResolvedValue(sessions) };
    const sessionsService = { checkSession: vi.fn().mockResolvedValue(true) };
    const useCase = new GetSessionsUseCase(repository, sessionsService as unknown as SessionsService);
    const auth = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    };

    await expect(useCase.execute(new GetSessionsQuery(auth))).resolves.toEqual(sessions);
    expect(sessionsService.checkSession).toHaveBeenCalledWith(auth);
    expect(repository.getActiveSessions).toHaveBeenCalledWith('1', auth.sessionId);
  });
});
