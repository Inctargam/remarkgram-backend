import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { SubscriptionsQueryRepository } from '../../ports/subscriptions-query.repository.js';

export class HasActiveSubscriptionQuery extends Query<boolean> {
  constructor(public readonly userId: number) {
    super();
  }
}

@QueryHandler(HasActiveSubscriptionQuery)
export class HasActiveSubscriptionQueryHandler implements IQueryHandler<HasActiveSubscriptionQuery> {
  constructor(private readonly subscriptionsQueryRepository: SubscriptionsQueryRepository) {}

  execute(query: HasActiveSubscriptionQuery) {
    return this.subscriptionsQueryRepository.hasActiveByUserId(query.userId);
  }
}
