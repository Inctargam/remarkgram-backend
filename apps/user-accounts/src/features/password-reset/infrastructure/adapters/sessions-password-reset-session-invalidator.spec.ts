import type { SessionsService } from '../../../sessions/application/sessions.service.js';
import { SessionsPasswordResetSessionInvalidator } from './sessions-password-reset-session-invalidator.js';

describe('SessionsPasswordResetSessionInvalidator', () => {
  it('invalidates all user sessions through sessions service', async () => {
    const sessionsService = {
      deleteAllUserSessions: vi.fn<SessionsService['deleteAllUserSessions']>().mockResolvedValue(2),
    };
    const invalidator = new SessionsPasswordResetSessionInvalidator(
      sessionsService as unknown as SessionsService,
    );
    const tx = {} as never;

    await expect(invalidator.invalidateAllUserSessions(1, tx)).resolves.toBeUndefined();
    expect(sessionsService.deleteAllUserSessions).toHaveBeenCalledWith('1', tx);
  });
});
