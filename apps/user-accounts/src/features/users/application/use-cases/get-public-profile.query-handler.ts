import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { type PublicUserProfileView } from '../types/users.types.js';
import { UsersQueryRepository } from '../ports/users-query.repository.js';
import { UserNotFoundError } from '../errors/users.errors.js';

export class GetPublicProfileQuery extends Query<PublicUserProfileView> {
  constructor(public readonly userId: number) {
    super();
  }
}

@QueryHandler(GetPublicProfileQuery)
export class GetPublicProfileHandler implements IQueryHandler<GetPublicProfileQuery> {
  constructor(private readonly queryRepository: UsersQueryRepository) {}
  async execute(query: GetPublicProfileQuery): Promise<PublicUserProfileView> {
    const profile = await this.queryRepository.findPublicProfileByUserId(query.userId);
    if (!profile) {
      throw new UserNotFoundError();
    }
    return profile;
  }
}
