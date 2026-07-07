import type { SessionsService } from '../sessions.service.js';
import {
  LogoutCurrentSessionCommand,
  LogoutCurrentSessionUseCase,
} from './logout-current-session.use-case.js';

describe('LogoutCurrentSessionUseCase', () => {
  it('revokes current session by verified refresh-token claims', async () => {
    const sessionsService = {
      revokeCurrentSession: vi.fn<SessionsService['revokeCurrentSession']>().mockResolvedValue(true),
    };
    const useCase = new LogoutCurrentSessionUseCase(sessionsService as unknown as SessionsService);
    const auth = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    };

    await expect(useCase.execute(new LogoutCurrentSessionCommand(auth))).resolves.toBeUndefined();
    expect(sessionsService.revokeCurrentSession).toHaveBeenCalledWith({
      ...auth,
      reason: 'USER_LOGOUT',
    });
  });

  it('keeps logout idempotent when current session is already absent', async () => {
    const sessionsService = {
      revokeCurrentSession: vi.fn<SessionsService['revokeCurrentSession']>().mockResolvedValue(false),
    };
    const useCase = new LogoutCurrentSessionUseCase(sessionsService as unknown as SessionsService);

    await expect(
      useCase.execute(
        new LogoutCurrentSessionCommand({
          userId: '1',
          sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
          jti: 'jti',
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
