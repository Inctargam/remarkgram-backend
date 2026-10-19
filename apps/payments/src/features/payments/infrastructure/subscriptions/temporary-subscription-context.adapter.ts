import { Injectable } from '@nestjs/common';
import {
  type ActiveSubscriptionForPurchase,
  SubscriptionContextPort,
} from '../../application/ports/subscription-context.port.js';

/**
 * Временная реализация до подключения Subscription Module.
 * Сохраняет текущее поведение: любая новая покупка считается первой.
 */
@Injectable()
export class TemporarySubscriptionContextAdapter extends SubscriptionContextPort {
  findActiveSubscriptionForPurchase(_userId: number): Promise<ActiveSubscriptionForPurchase | null> {
    return Promise.resolve(null);
  }
}
