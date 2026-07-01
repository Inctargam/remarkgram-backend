import type { AuthService } from '../auth.service.js';
import type { SessionsService } from '../../sessions/application/sessions.service.js';
import { RefreshTokenValidator } from './refresh-token-validator.js';

describe('RefreshTokenValidator', () => {
  const payload = {
    sub: '1',
    sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
    jti: 'jti',
    iat: 100,
    exp: 200,
  };
  const authService = {
    verifyRefreshToken: vi.fn<AuthService['verifyRefreshToken']>(),
  };
  const sessionsService = {
    checkSession: vi.fn<SessionsService['checkSession']>(),
  };
  const validator = new RefreshTokenValidator(
    authService as unknown as AuthService,
    sessionsService as unknown as SessionsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the payload for an active refresh token', async () => {
    authService.verifyRefreshToken.mockResolvedValue(payload);
    sessionsService.checkSession.mockResolvedValue(true);

    await expect(validator.validate('refresh-token')).resolves.toEqual(payload);
  });

  it('rejects a refresh token whose session is no longer active', async () => {
    authService.verifyRefreshToken.mockResolvedValue(payload);
    sessionsService.checkSession.mockResolvedValue(false);

    await expect(validator.validate('refresh-token')).rejects.toThrow('No active session found');
  });

  it('treats an invalid cookie as no active session during login', async () => {
    authService.verifyRefreshToken.mockRejectedValue(new Error('invalid'));

    await expect(validator.isActive('invalid-refresh-token')).resolves.toBe(false);
    expect(sessionsService.checkSession).not.toHaveBeenCalled();
  });
});
