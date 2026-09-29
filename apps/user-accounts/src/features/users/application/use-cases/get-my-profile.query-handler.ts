import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { MyProfileView } from '../types/users.types.js';
import { UsersQueryRepository } from '../ports/users-query.repository.js';
import { UserNotFoundError } from '../errors/users.errors.js';

export class GetMyProfileQuery extends Query<MyProfileView> {
  constructor(public readonly userId: number) {
    super();
  }
}

@QueryHandler(GetMyProfileQuery)
export class GetMyProfileHandler implements IQueryHandler<GetMyProfileQuery> {
  constructor(private readonly queryRepository: UsersQueryRepository) {}

  async execute({ userId }: GetMyProfileQuery): Promise<MyProfileView> {
    const profile = await this.queryRepository.findMyProfileByUserId(userId);
    if (!profile) {
      throw new UserNotFoundError();
    }
    return profile;
  }
}
