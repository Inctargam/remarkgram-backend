import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { authConfig } from '../../config/auth.config.js';
import { UsersRepository } from '../users/application/ports/users.repository.js';
import type { User } from '../users/domain/entities/user.entity.js';
import type {
  GeneratedTokenPair,
  GenerateTokenPairParams,
  JwtRefreshPayload,
} from './application/types/auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async validateCredentials(loginOrEmail: string, password: string): Promise<User> {
    const user = await this.usersRepository.findByLoginOrEmail(loginOrEmail);

    if (!user || !(await bcrypt.compare(password, user.hash))) {
      throw new Error('Incorrect login/password');
    }

    return user;
  }

  async generateTokenPair(params: GenerateTokenPairParams): Promise<GeneratedTokenPair> {
    const { userId, sessionId } = params;
    const accessToken = await this.generateAccessToken(userId);
    const refreshToken = await this.generateRefreshToken(userId, sessionId);
    const refreshTokenPayload = this.jwtService.decode<JwtRefreshPayload>(refreshToken);

    return { accessToken, refreshToken, refreshTokenPayload };
  }

  async generateAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId },
      {
        expiresIn: this.auth.accessTokenExpiresIn,
      },
    );
  }

  async verifyRefreshToken(refreshToken: string): Promise<JwtRefreshPayload> {
    return this.jwtService.verifyAsync<JwtRefreshPayload>(refreshToken);
  }

  async generateRefreshToken(userId: string, sessionId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, sessionId, jti: randomUUID() },
      {
        expiresIn: this.auth.refreshTokenExpiresIn,
      },
    );
  }
}
