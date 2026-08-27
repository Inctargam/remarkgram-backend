import type { CurrentUserView } from '../types/users.types.js';

export abstract class UsersQueryRepository {
  abstract findCurrentById(userId: number): Promise<CurrentUserView | null>;
}
