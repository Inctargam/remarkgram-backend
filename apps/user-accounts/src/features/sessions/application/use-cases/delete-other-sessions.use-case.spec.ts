import type { SessionsService } from '../sessions.service.js';
import { DeleteOtherSessionsCommand, DeleteOtherSessionsUseCase } from './delete-other-sessions.use-case.js';

describe('DeleteOtherSessionsUseCase', () => {
  const auth = {
    userId: '1',
    sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
    jti: 'jti',
  };

  it('deletes all user sessions except current one when current session is active', async () => {
    const sessionsService = {
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(true),
      deleteOtherUserSessions: vi.fn<SessionsService['deleteOtherUserSessions']>().mockResolvedValue(2),
    };
    const useCase = new DeleteOtherSessionsUseCase(sessionsService as unknown as SessionsService);

    await expect(useCase.execute(new DeleteOtherSessionsCommand(auth))).resolves.toBeUndefined();

    expect(sessionsService.checkSession).toHaveBeenCalledWith(auth);
    expect(sessionsService.deleteOtherUserSessions).toHaveBeenCalledWith(auth.userId, auth.sessionId);
  });

  it('rejects delete when current session is inactive', async () => {
    const sessionsService = {
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(false),
      deleteOtherUserSessions: vi.fn<SessionsService['deleteOtherUserSessions']>(),
    };
    const useCase = new DeleteOtherSessionsUseCase(sessionsService as unknown as SessionsService);

    await expect(useCase.execute(new DeleteOtherSessionsCommand(auth))).rejects.toThrow(
      'No active session found',
    );
    expect(sessionsService.deleteOtherUserSessions).not.toHaveBeenCalled();
  });
});
