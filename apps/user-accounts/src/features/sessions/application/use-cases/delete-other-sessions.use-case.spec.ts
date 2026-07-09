import type { SessionsService } from '../sessions.service.js';
import { DeleteOtherSessionsCommand, DeleteOtherSessionsUseCase } from './delete-other-sessions.use-case.js';

describe('DeleteOtherSessionsUseCase', () => {
  const auth = {
    userId: '1',
    sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
    jti: 'jti',
  };

  it('revokes all user sessions except current one when current session is active', async () => {
    const sessionsService = {
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(true),
      revokeOtherUserSessions: vi.fn<SessionsService['revokeOtherUserSessions']>().mockResolvedValue(2),
    };
    const useCase = new DeleteOtherSessionsUseCase(sessionsService as unknown as SessionsService);

    await expect(useCase.execute(new DeleteOtherSessionsCommand(auth))).resolves.toBeUndefined();

    expect(sessionsService.checkSession).toHaveBeenCalledWith(auth);
    expect(sessionsService.revokeOtherUserSessions).toHaveBeenCalledWith({
      userId: auth.userId,
      currentSessionId: auth.sessionId,
      reason: 'LOGOUT_ALL',
    });
  });

  it('rejects delete when current session is inactive', async () => {
    const sessionsService = {
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(false),
      revokeOtherUserSessions: vi.fn<SessionsService['revokeOtherUserSessions']>(),
    };
    const useCase = new DeleteOtherSessionsUseCase(sessionsService as unknown as SessionsService);

    await expect(useCase.execute(new DeleteOtherSessionsCommand(auth))).rejects.toThrow(
      'No active session found',
    );
    expect(sessionsService.revokeOtherUserSessions).not.toHaveBeenCalled();
  });
});
