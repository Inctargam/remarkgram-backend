import { Injectable } from '@nestjs/common';
import { AuthService } from '../../auth/application/auth.service.js';
import type { User } from '../domain/entities/user.entity.js';
import { EmailAlreadyExistsError, UsernameAlreadyExistsError } from './errors/users.errors.js';
import { UsersRepository } from './ports/users.repository.js';
import type { CreateUserParams } from './types/users.types.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authService: AuthService,
  ) {}

  /** Проверяет уникальность данных, хеширует пароль и создаёт пользователя в репозитории. */
  async createUser(params: CreateUserParams): Promise<User> {
    const {
      username,
      email,
      password,
      confirmation = { isConfirmed: true, code: null, expiration: null },
      passwordRecovery = { code: null, expiration: null },
    } = params;

    if (await this.usersRepository.isUsernameExists(username)) {
      throw new UsernameAlreadyExistsError();
    }

    if (await this.usersRepository.isEmailExists(email)) {
      throw new EmailAlreadyExistsError();
    }

    const hash = await this.authService.hashPassword(password);

    return this.usersRepository.create({
      username,
      email,
      hash,
      createdAt: new Date(),
      confirmation,
      passwordRecovery,
    });
  }
}
