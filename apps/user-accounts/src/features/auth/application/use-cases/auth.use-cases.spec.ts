import type { AuthService } from '../auth.service.js';
import type { SessionsService } from '../../../sessions/application/sessions.service.js';
import { createTestUser } from '../../../../../test/factories/user.factory.js';
import { ConfirmationInfo } from '../../../users/domain/value-objects/confirmation-info.js';
import { LoginCommand, LoginUseCase } from './login.use-case.js';
import { RefreshTokenCommand, RefreshTokenUseCase } from './refresh-token.use-case.js';

describe('auth use cases', () => {
  const params = {
    email: 'user@example.com',
    password: 'password',
    ip: '127.0.0.1',
    deviceName: 'Browser',
  };
  const user = createTestUser({
    hash: 'hash',
    confirmation: ConfirmationInfo.confirmed(),
  });
  const tokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenPayload: {
      sub: '1',
      aud: 'auth',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'new-jti',
      iat: 100,
      exp: 200,
    },
  };

  it('LoginUseCase creates tokens and a new session', async () => {
    const authService = {
      generateTokenPair: vi.fn<AuthService['generateTokenPair']>().mockResolvedValue(tokenPair),
      validateCredentials: vi.fn<AuthService['validateCredentials']>().mockResolvedValue(user),
    };
    const sessionsService = {
      createSession: vi.fn<SessionsService['createSession']>().mockResolvedValue(true),
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(false),
    };
    const useCase = new LoginUseCase(
      authService as unknown as AuthService,
      sessionsService as unknown as SessionsService,
    );

    await expect(useCase.execute(new LoginCommand(params))).resolves.toEqual({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });
    const generatedSessionId = authService.generateTokenPair.mock.calls[0][0].sessionId;
    expect(typeof generatedSessionId).toBe('string');
    expect(authService.generateTokenPair).toHaveBeenCalledWith({
      userId: user.id.toString(),
      sessionId: generatedSessionId,
    });
    expect(sessionsService.createSession).toHaveBeenCalledWith({
      userId: user.id.toString(),
      expectedPasswordHash: user.hash,
      sessionId: generatedSessionId,
      deviceName: params.deviceName,
      ip: params.ip,
      jti: 'new-jti',
      lastActiveAt: new Date(100_000),
      expiresAt: new Date(200_000),
    });
  });

  it('LoginUseCase rejects credentials when the password changes before session creation', async () => {
    const authService = {
      generateTokenPair: vi.fn<AuthService['generateTokenPair']>().mockResolvedValue(tokenPair),
      validateCredentials: vi.fn<AuthService['validateCredentials']>().mockResolvedValue(user),
    };
    const sessionsService = {
      createSession: vi.fn<SessionsService['createSession']>().mockResolvedValue(false),
      checkSession: vi.fn<SessionsService['checkSession']>().mockResolvedValue(false),
    };
    const useCase = new LoginUseCase(
      authService as unknown as AuthService,
      sessionsService as unknown as SessionsService,
    );

    await expect(useCase.execute(new LoginCommand(params))).rejects.toThrow('Incorrect email/password');
  });

  it('RefreshTokenUseCase rotates the token for the same session', async () => {
    const currentSession = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'old-jti',
    };
    const authService = {
      generateTokenPair: vi.fn<AuthService['generateTokenPair']>().mockResolvedValue(tokenPair),
    };
    const sessionsService = {
      rotateRefreshToken: vi.fn<SessionsService['rotateRefreshToken']>().mockResolvedValue(undefined),
    };
    const useCase = new RefreshTokenUseCase(
      authService as unknown as AuthService,
      sessionsService as unknown as SessionsService,
    );
    const refreshParams = {
      auth: currentSession,
      ip: params.ip,
      deviceName: params.deviceName,
    };

    await expect(useCase.execute(new RefreshTokenCommand(refreshParams))).resolves.toEqual({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });
    expect(authService.generateTokenPair).toHaveBeenCalledWith({
      userId: currentSession.userId,
      sessionId: currentSession.sessionId,
    });
    expect(sessionsService.rotateRefreshToken).toHaveBeenCalledWith({
      userId: currentSession.userId,
      sessionId: currentSession.sessionId,
      currentJti: currentSession.jti,
      newJti: 'new-jti',
      deviceName: params.deviceName,
      ip: params.ip,
      lastActiveAt: new Date(100_000),
      expiresAt: new Date(200_000),
    });
  });
});
