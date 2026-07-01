import type { ConfigType } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { authConfig } from '../../config/auth.config.js';
import type { UsersRepository } from '../users/application/ports/users.repository.js';
import { User } from '../users/domain/entities/user.entity.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const usersRepository = {
    findByLoginOrEmail: vi.fn<UsersRepository['findByLoginOrEmail']>(),
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
      jwtService as unknown as JwtService,
      auth,
    );
  });

  it('validates login and password', async () => {
    const hash = await bcrypt.hash('password', 4);
    const user = User.restore({
      id: 1,
      username: 'user',
      email: 'user@example.com',
      hash,
    });
    usersRepository.findByLoginOrEmail.mockResolvedValue(user);

    await expect(service.validateCredentials('user', 'password')).resolves.toBe(user);
    await expect(service.validateCredentials('user', 'wrong-password')).rejects.toThrow(
      'Incorrect login/password',
    );
  });

  it('rejects an unknown user', async () => {
    usersRepository.findByLoginOrEmail.mockResolvedValue(null);

    await expect(service.validateCredentials('unknown', 'password')).rejects.toThrow(
      'Incorrect login/password',
    );
  });

  it('generates a token pair for the given session', async () => {
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    const refreshTokenPayload = {
      sub: '1',
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
  });
});
