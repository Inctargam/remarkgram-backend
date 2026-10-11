import { Injectable } from '@nestjs/common';
import {
  SubscriptionPaymentHandler,
  SubscriptionPaymentUnavailableError,
} from '../application/ports/subscription-payment-handler.js';

@Injectable()
export class UnavailableSubscriptionPaymentHandler extends SubscriptionPaymentHandler {
  applySuccessfulPayment(): Promise<never> {
    return Promise.reject(new SubscriptionPaymentUnavailableError('Subscription module is unavailable'));
  }
}
