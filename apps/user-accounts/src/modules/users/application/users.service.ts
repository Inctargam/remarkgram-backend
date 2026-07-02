import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { authConfig } from '../../../config/auth.config.js';
import { AuthService } from '../../auth/auth.service.js';
import { EmailService } from '../../notifications/email.service.js';
import type { User } from '../domain/entities/user.entity.js';
import { UsersRepository } from './ports/users.repository.js';
import type { CreateUserParams, RegisterUserParams } from './types/users.types.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /** Проверяет уникальность данных, хеширует пароль и создаёт пользователя в репозитории. */
  async createUser(params: CreateUserParams): Promise<User> {
    const {
      login,
      email,
      password,
      confirmation = { isConfirmed: true, code: null, expiration: null },
      passwordRecovery = { code: null, expiration: null },
    } = params;

    if (await this.usersRepository.isUsernameExists(login)) {
      throw new Error('Login already exists');
    }

    if (await this.usersRepository.isEmailExists(email)) {
      throw new Error('Email already exists');
    }

    const hash = await this.authService.hashPassword(password);

    return this.usersRepository.create({
      username: login,
      email,
      hash,
      createdAt: new Date(),
      confirmation,
      passwordRecovery,
    });
  }

  /** Создаёт неподтверждённого пользователя и отправляет код подтверждения email. */
  async registerUser(params: RegisterUserParams): Promise<User> {
    const code = randomUUID();
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + this.auth.confirmationCodeExpiresIn);

    const user = await this.createUser({
      ...params,
      confirmation: { isConfirmed: false, code, expiration },
      passwordRecovery: { code: null, expiration: null },
    });

    await this.emailService.sendConfirmationCode(params.email, code);

    return user;
  }
}
