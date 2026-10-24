import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  SubscriptionContextPort,
  type ActiveSubscriptionForPurchase,
} from '../../../payments/application/ports/subscription-context.port.js';
import { FindActiveSubscriptionForPurchaseQuery } from '../../application/use-cases/find-active-subscription-for-purchase/find-active-subscription-for-purchase.query-handler.js';

@Injectable()
export class LocalSubscriptionContextAdapter extends SubscriptionContextPort {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  findActiveSubscriptionForPurchase(userId: number): Promise<ActiveSubscriptionForPurchase | null> {
    return this.queryBus.execute(new FindActiveSubscriptionForPurchaseQuery(userId));
  }
}
