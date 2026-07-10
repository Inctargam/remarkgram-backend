import type { ConfigType } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { authConfig } from '../../../config/auth.config.js';
import type { SessionsService } from '../../sessions/application/sessions.service.js';
import type { UsersRepository } from '../../users/application/ports/users.repository.js';
import { createTestUser } from '../../../../test/factories/user.factory.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const usersRepository = {
    findByEmail: vi.fn<UsersRepository['findByEmail']>(),
  };
  const sessionsService = {
    checkSession: vi.fn<SessionsService['checkSession']>(),
  };
  const jwtService = {
    signAsync: vi.fn(),
    decode: vi.fn(),
    verifyAsync: vi.fn(),
  };
  const auth = {
    jwtPrivateKey: 'private-key',
    accessTokenExpiresIn: '10m',
    refreshTokenExpiresIn: '20m',
    confirmationCodeExpiresIn: 24,
    recoveryCodeExpiresIn: 1,
  } as ConfigType<typeof authConfig>;
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(
      usersRepository as unknown as UsersRepository,
      sessionsService as unknown as SessionsService,
      jwtService as unknown as JwtService,
      auth,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates username and password', async () => {
    const hash = await bcrypt.hash('password', 4);
    const user = createTestUser({ hash });
    usersRepository.findByEmail.mockResolvedValue(user);

    await expect(service.validateCredentials('user@example.com', 'password')).resolves.toBe(user);
    await expect(service.validateCredentials('user@example.com', 'wrong-password')).rejects.toThrow(
      'Incorrect email/password',
    );
  });

  it('rejects an unknown user', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(service.validateCredentials('unknown@example.com', 'password')).rejects.toThrow(
      'Incorrect email/password',
    );
  });

  it('generates a token pair for the given session', async () => {
    const generatedJti = '00000000-0000-4000-8000-000000000000';
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedJti);
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    const refreshTokenPayload = {
      sub: '1',
      aud: 'auth',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
      iat: 100,
      exp: 200,
    };
    jwtService.decode.mockReturnValue(refreshTokenPayload);

    await expect(
      service.generateTokenPair({
        userId: '1',
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenPayload,
    });
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      { sub: '1' },
      { audience: 'api', expiresIn: '10m' },
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      {
        sub: '1',
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        jti: generatedJti,
      },
      { audience: 'auth', expiresIn: '20m' },
    );
  });

  it('returns the payload for an active refresh token', async () => {
    const payload = {
      sub: '1',
      aud: 'auth',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
      iat: 100,
      exp: 200,
    };
    jwtService.verifyAsync.mockResolvedValue(payload);
    sessionsService.checkSession.mockResolvedValue(true);

    await expect(service.validateRefreshToken('refresh-token')).resolves.toEqual(payload);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('refresh-token', { audience: 'auth' });
  });

  it('rejects a refresh token whose session is no longer active', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: '1',
      aud: 'auth',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
      iat: 100,
      exp: 200,
    });
    sessionsService.checkSession.mockResolvedValue(false);

    await expect(service.validateRefreshToken('refresh-token')).rejects.toThrow('No active session found');
  });

  it('rejects an invalid refresh token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

    await expect(service.validateRefreshToken('invalid-refresh-token')).rejects.toThrow(
      'Invalid refresh token',
    );
    expect(sessionsService.checkSession).not.toHaveBeenCalled();
  });
});
