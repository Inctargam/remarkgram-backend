import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { SubscriptionContextPort } from '../../../payments/application/ports/subscription-context.port.js';
import { HasActiveSubscriptionQuery } from '../../application/use-cases/has-active-subscription/has-active-subscription.query-handler.js';

@Injectable()
export class LocalSubscriptionContextAdapter extends SubscriptionContextPort {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  hasActiveSubscription(userId: number): Promise<boolean> {
    return this.queryBus.execute(new HasActiveSubscriptionQuery(userId));
  }
}
