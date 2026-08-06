import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';

import { authConfig } from '../../../config/auth.config.js';
import { NoActiveSessionError } from '../../sessions/application/errors/sessions.errors.js';
import { SessionsService } from '../../sessions/application/sessions.service.js';
import { UsersRepository } from '../../users/application/ports/users.repository.js';
import type { User } from '../../users/domain/entities/user.entity.js';
import { IncorrectCredentialsError, InvalidRefreshTokenError } from './errors/auth.errors.js';
import type { GeneratedTokenPair, GenerateTokenPairParams, JwtRefreshPayload } from './types/auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsService: SessionsService,
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /** Создаёт безопасный bcrypt-хеш пароля перед сохранением пользователя. */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** Проверяет email и сравнивает переданный пароль с сохранённым хешем. */
  async verifyCredentials(email: string, password: string): Promise<User> {
    const user = await this.usersRepository.findByEmail(email);

    if (!user?.hash || !(await bcrypt.compare(password, user.hash))) {
      throw new IncorrectCredentialsError();
    }

    return user;
  }

  /**
   * Выпускает связанную пару токенов для указанной сессии: access-токен возвращается клиенту,
   * refresh-токен передаётся в Gateway для установки cookie, а его payload используется только внутри
   * user-accounts для сохранения нового jti и дат активности сессии при создании или ротации.
   */
  async generateTokenPair(params: GenerateTokenPairParams): Promise<GeneratedTokenPair> {
    const { userId, sessionId } = params;
    const accessToken = await this.generateAccessToken(userId);
    const refreshToken = await this.generateRefreshToken(userId, sessionId);
    const refreshTokenPayload = this.jwtService.decode<JwtRefreshPayload>(refreshToken);

    return { accessToken, refreshToken, refreshTokenPayload };
  }

  /** Выпускает короткоживущий access-токен с аудиторией API. */
  private generateAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId },
      {
        audience: 'api',
        expiresIn: this.auth.accessTokenExpiresIn,
      },
    );
  }

  /** Выпускает refresh-токен с аудиторией auth, связанный с конкретной сессией и уникальным jti. */
  private generateRefreshToken(userId: string, sessionId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, sessionId, jti: crypto.randomUUID() },
      {
        audience: 'auth',
        expiresIn: this.auth.refreshTokenExpiresIn,
      },
    );
  }

  /**
   * Проверяет подпись refresh-токена и существование соответствующей активной сессии.
   * Не используется в рабочем потоке: API Gateway проверяет подпись refresh-токена и передаёт проверенные
   * claims. Метод оставлен до окончательного решения о месте проверки подписи.
   */
  async validateRefreshToken(refreshToken: string): Promise<JwtRefreshPayload> {
    let payload: JwtRefreshPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(refreshToken, {
        audience: 'auth',
      });
    } catch {
      throw new InvalidRefreshTokenError();
    }

    const isSessionActive = await this.sessionsService.checkSession({
      userId: payload.sub,
      sessionId: payload.sessionId,
      jti: payload.jti,
    });

    if (!isSessionActive) {
      throw new NoActiveSessionError();
    }

    return payload;
  }
}
