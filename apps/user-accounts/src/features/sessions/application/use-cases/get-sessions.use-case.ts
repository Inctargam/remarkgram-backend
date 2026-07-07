import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NoActiveSessionError } from '../errors/sessions.errors.js';
import { SessionsQueryRepository } from '../ports/sessions-query.repository.js';
import { SessionsService } from '../sessions.service.js';
import type { SessionIdentity, SessionView } from '../types/sessions.types.js';

export class GetSessionsQuery extends Query<SessionView[]> {
  constructor(public readonly auth: SessionIdentity) {
    super();
  }
}

@QueryHandler(GetSessionsQuery)
export class GetSessionsUseCase implements IQueryHandler<GetSessionsQuery> {
  constructor(
    private readonly sessionsQueryRepository: SessionsQueryRepository,
    private readonly sessionsService: SessionsService,
  ) {}

  async execute(query: GetSessionsQuery) {
    if (!(await this.sessionsService.checkSession(query.auth))) {
      throw new NoActiveSessionError();
    }

    return this.sessionsQueryRepository.getActiveSessions(query.auth.userId, query.auth.sessionId);
  }
}
