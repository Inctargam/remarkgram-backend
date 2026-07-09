import type { SessionsService } from '../sessions.service.js';
import { DeleteSessionCommand, DeleteSessionUseCase } from './delete-session.use-case.js';

describe('DeleteSessionUseCase', () => {
  const auth = {
    userId: '1',
    sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
    jti: 'jti',
  };

  it('revokes selected user session when current session is active', async () => {
    const sessionsService = {
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(true),
      revokeUserSession: vi.fn<SessionsService['revokeUserSession']>().mockResolvedValue(true),
    };
    const useCase = new DeleteSessionUseCase(sessionsService as unknown as SessionsService);

    await expect(
      useCase.execute(
        new DeleteSessionCommand({
          auth,
          sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
        }),
      ),
    ).resolves.toBeUndefined();

    expect(sessionsService.checkSession).toHaveBeenCalledWith(auth);
    expect(sessionsService.revokeUserSession).toHaveBeenCalledWith({
      userId: '1',
      sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
      reason: 'USER_LOGOUT',
    });
  });

  it('rejects delete when current session is inactive', async () => {
    const sessionsService = {
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(false),
      revokeUserSession: vi.fn<SessionsService['revokeUserSession']>(),
    };
    const useCase = new DeleteSessionUseCase(sessionsService as unknown as SessionsService);

    await expect(
      useCase.execute(
        new DeleteSessionCommand({
          auth,
          sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
        }),
      ),
    ).rejects.toThrow('No active session found');

    expect(sessionsService.revokeUserSession).not.toHaveBeenCalled();
  });

  it('rejects delete when selected session does not belong to current user', async () => {
    const sessionsService = {
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(true),
      revokeUserSession: vi.fn<SessionsService['revokeUserSession']>().mockResolvedValue(false),
    };
    const useCase = new DeleteSessionUseCase(sessionsService as unknown as SessionsService);

    await expect(
      useCase.execute(
        new DeleteSessionCommand({
          auth,
          sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
        }),
      ),
    ).rejects.toThrow('Session not found');
  });
});
