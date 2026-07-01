import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { SessionsQueryRepository } from '../ports/sessions-query.repository.js';
import type { SessionView } from '../types/sessions.types.js';

export class GetSessionsQuery extends Query<SessionView[]> {
  constructor(public readonly userId: string) {
    super();
  }
}

@QueryHandler(GetSessionsQuery)
export class GetSessionsUseCase implements IQueryHandler<GetSessionsQuery> {
  constructor(private readonly sessionsQueryRepository: SessionsQueryRepository) {}

  async execute(query: GetSessionsQuery) {
    return this.sessionsQueryRepository.getActiveSessions(query.userId);
  }
}
