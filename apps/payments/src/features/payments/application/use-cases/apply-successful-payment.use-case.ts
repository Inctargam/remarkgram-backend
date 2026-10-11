import { Injectable } from '@nestjs/common';
import { PaymentsRepository } from '../ports/payments.repository.js';
import {
  InvalidSubscriptionPaymentResultError,
  SubscriptionPaymentHandler,
  SubscriptionPaymentUnavailableError,
} from '../ports/subscription-payment-handler.js';

export type ApplySuccessfulPaymentResult =
  | {
      outcome: 'APPLIED';
      paymentId: string;
      subscriptionId: string;
      action: 'CREATED' | 'SCHEDULED' | 'RENEWED';
    }
  | { outcome: 'ALREADY_APPLIED'; paymentId: string; subscriptionId: string }
  | { outcome: 'RETRY_REQUIRED'; reason: 'D2_UNAVAILABLE' | 'TRANSIENT_DATABASE_ERROR' }
  | {
      outcome: 'REJECTED';
      reason: 'PAYMENT_NOT_FOUND' | 'PAYMENT_NOT_SUCCEEDED' | 'INVALID_SUBSCRIPTION_RESULT';
    };

@Injectable()
export class ApplySuccessfulPaymentUseCase {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly subscriptions: SubscriptionPaymentHandler,
  ) {}
  async execute(paymentId: string): Promise<ApplySuccessfulPaymentResult> {
    try {
      const result = await this.payments.applySuccessfulPayment(paymentId, (payment, tx) =>
        this.subscriptions.applySuccessfulPayment(
          {
            paymentId: payment.id,
            userId: payment.userId,
            planId: payment.planId,
            type: payment.type,
            checkoutPurpose: payment.checkoutPurpose,
            provider: payment.providerType,
            providerSubscriptionId: payment.providerSubscriptionId ?? undefined,
            currentSubscriptionId: payment.targetSubscriptionId ?? undefined,
            periodCount: payment.periodCount,
            periodUnit: payment.periodUnit,
            autoRenewalRequested: payment.autoRenewalRequested ?? false,
            paidAt: payment.paidAt!,
          },
          tx,
        ),
      );
      if (result.outcome === 'NOT_FOUND') return { outcome: 'REJECTED', reason: 'PAYMENT_NOT_FOUND' };
      if (result.outcome === 'NOT_SUCCEEDED') return { outcome: 'REJECTED', reason: 'PAYMENT_NOT_SUCCEEDED' };
      if (result.outcome === 'ALREADY_APPLIED') {
        return { outcome: result.outcome, paymentId, subscriptionId: result.payment!.subscriptionId! };
      }
      return {
        outcome: result.outcome,
        paymentId,
        subscriptionId: result.payment!.subscriptionId!,
        action: result.action!,
      };
    } catch (error) {
      if (error instanceof InvalidSubscriptionPaymentResultError) {
        await this.payments.markApplicationError(paymentId, 'INVALID_SUBSCRIPTION_RESULT');
        return { outcome: 'REJECTED', reason: 'INVALID_SUBSCRIPTION_RESULT' };
      }
      if (error instanceof SubscriptionPaymentUnavailableError) {
        await this.payments.markApplicationError(paymentId, 'D2_UNAVAILABLE');
        return { outcome: 'RETRY_REQUIRED', reason: 'D2_UNAVAILABLE' };
      }
      await this.payments.markApplicationError(paymentId, 'TRANSIENT_DATABASE_ERROR');
      return { outcome: 'RETRY_REQUIRED', reason: 'TRANSIENT_DATABASE_ERROR' };
    }
  }
}
