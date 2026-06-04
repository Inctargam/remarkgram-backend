import type { User } from '../../domain/entities/user.entity.js';

export abstract class UsersRepository {
  abstract findMany(): Promise<User[]>;
}
