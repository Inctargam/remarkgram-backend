import type { SessionsService } from '../sessions.service.js';
import {
  LogoutCurrentSessionCommand,
  LogoutCurrentSessionUseCase,
} from './logout-current-session.use-case.js';

describe('LogoutCurrentSessionUseCase', () => {
  it('deletes current session by verified refresh-token claims', async () => {
    const sessionsService = {
      deleteCurrentSession: vi.fn<SessionsService['deleteCurrentSession']>().mockResolvedValue(true),
    };
    const useCase = new LogoutCurrentSessionUseCase(sessionsService as unknown as SessionsService);
    const auth = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    };

    await expect(useCase.execute(new LogoutCurrentSessionCommand(auth))).resolves.toBeUndefined();
    expect(sessionsService.deleteCurrentSession).toHaveBeenCalledWith(auth);
  });

  it('keeps logout idempotent when current session is already absent', async () => {
    const sessionsService = {
      deleteCurrentSession: vi.fn<SessionsService['deleteCurrentSession']>().mockResolvedValue(false),
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
