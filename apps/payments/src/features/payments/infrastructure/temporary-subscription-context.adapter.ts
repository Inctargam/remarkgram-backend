import { Injectable } from '@nestjs/common';
import {
  SubscriptionContextPort,
  type SubscriptionPurchaseContext,
} from '../application/ports/subscription-context.port.js';

/**
 * Временная реализация до подключения Subscription Module.
 * Сохраняет текущее поведение: любая новая покупка считается первой.
 */
@Injectable()
export class TemporarySubscriptionContextAdapter extends SubscriptionContextPort {
  getPurchaseContext(_userId: number): Promise<SubscriptionPurchaseContext> {
    return Promise.resolve({ kind: 'FIRST_PURCHASE' });
  }
}
