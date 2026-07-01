import type { AuthService } from '../../auth.service.js';
import type { SessionsService } from '../../../sessions/application/sessions.service.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import type { RefreshTokenValidator } from '../refresh-token-validator.js';
import { LoginCommand, LoginUseCase } from './login.use-case.js';
import { RefreshTokenCommand, RefreshTokenUseCase } from './refresh-token.use-case.js';

describe('auth use cases', () => {
  const params = {
    loginOrEmail: 'user',
    password: 'password',
    ip: '127.0.0.1',
    deviceName: 'Browser',
  };
  const user = User.restore({
    id: 1,
    username: 'user',
    email: 'user@example.com',
    hash: 'hash',
    confirmation: { isConfirmed: true, code: null, expiration: null },
  });
  const tokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenPayload: {
      sub: '1',
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
      createSession: vi.fn<SessionsService['createSession']>().mockResolvedValue(undefined),
    };
    const refreshTokenValidator = {
      isActive: vi.fn<RefreshTokenValidator['isActive']>().mockResolvedValue(false),
    };
    const useCase = new LoginUseCase(
      authService as unknown as AuthService,
      sessionsService as unknown as SessionsService,
      refreshTokenValidator as unknown as RefreshTokenValidator,
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
      sessionId: generatedSessionId,
      deviceName: params.deviceName,
      ip: params.ip,
      jti: 'new-jti',
      lastActiveAt: new Date(100_000),
      expiresAt: new Date(200_000),
    });
  });

  it('RefreshTokenUseCase rotates the token for the same session', async () => {
    const authService = {
      generateTokenPair: vi.fn<AuthService['generateTokenPair']>().mockResolvedValue(tokenPair),
    };
    const sessionsService = {
      rotateRefreshToken: vi.fn<SessionsService['rotateRefreshToken']>().mockResolvedValue(undefined),
    };
    const currentPayload = {
      sub: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'old-jti',
      iat: 50,
      exp: 100,
    };
    const refreshTokenValidator = {
      validate: vi.fn<RefreshTokenValidator['validate']>().mockResolvedValue(currentPayload),
    };
    const useCase = new RefreshTokenUseCase(
      authService as unknown as AuthService,
      sessionsService as unknown as SessionsService,
      refreshTokenValidator as unknown as RefreshTokenValidator,
    );
    const refreshParams = {
      refreshToken: 'current-refresh-token',
      ip: params.ip,
      deviceName: params.deviceName,
    };

    await expect(useCase.execute(new RefreshTokenCommand(refreshParams))).resolves.toEqual({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });
    expect(authService.generateTokenPair).toHaveBeenCalledWith({
      userId: currentPayload.sub,
      sessionId: currentPayload.sessionId,
    });
    expect(sessionsService.rotateRefreshToken).toHaveBeenCalledWith({
      sessionId: currentPayload.sessionId,
      currentJti: currentPayload.jti,
      newJti: 'new-jti',
      deviceName: params.deviceName,
      ip: params.ip,
      lastActiveAt: new Date(100_000),
      expiresAt: new Date(200_000),
    });
  });
});
