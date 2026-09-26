import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { InvalidUserIdError } from '../errors/users.errors.js';
import { UsersQueryRepository } from '../ports/users-query.repository.js';
import type { CurrentUserView } from '../types/users.types.js';

export class GetCurrentUserQuery extends Query<CurrentUserView> {
  constructor(public readonly userId: string) {
    super();
  }
}

@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserUseCase implements IQueryHandler<GetCurrentUserQuery> {
  constructor(private readonly usersQueryRepository: UsersQueryRepository) {}

  async execute(query: GetCurrentUserQuery): Promise<CurrentUserView> {
    const userId = Number(query.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    const user = await this.usersQueryRepository.findCurrentById(userId);
    if (!user) {
      throw new InvalidUserIdError();
    }

    return user;
  }
}
