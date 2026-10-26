import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { SubscriptionsQueryRepository } from '../../ports/subscriptions-query.repository.js';
import type { FindActiveSubscriptionResult } from '../../types/subscriptions.types.js';

export class FindActiveSubscriptionForPurchaseQuery extends Query<FindActiveSubscriptionResult | null> {
  constructor(public readonly userId: number) {
    super();
  }
}

@QueryHandler(FindActiveSubscriptionForPurchaseQuery)
export class FindActiveSubscriptionForPurchaseQueryHandler implements IQueryHandler<FindActiveSubscriptionForPurchaseQuery> {
  constructor(private readonly subscriptionsQueryRepository: SubscriptionsQueryRepository) {}

  execute(query: FindActiveSubscriptionForPurchaseQuery) {
    return this.subscriptionsQueryRepository.findActiveByUserId(query.userId);
  }
}
