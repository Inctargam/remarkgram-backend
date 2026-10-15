import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PeriodUnit } from '../../../plans/domain/plan.entity.js';
import { PaymentType } from '../../domain/payment.entity.js';
import { PaymentsRepository } from '../../application/ports/payments.repository.js';
import {
  SubscriptionPaymentHandler,
  type ApplySuccessfulPaymentResult,
} from '../../application/ports/subscription-payment.handler.js';
import type { PaymentsTransactionContext } from '../../application/ports/payments-unit-of-work.js';
import type { SuccessfulPayment } from '../../application/types/successful-payment.types.js';

/**
 * Temporary adapter for exercising the first-subscription workflow before D2
 * persistence is available. It creates no Subscription record; the generated
 * UUID is stored only as Payment.subscriptionId by the D1 use case.
 */
@Injectable()
export class TemporarySubscriptionPaymentHandlerAdapter extends SubscriptionPaymentHandler {
  constructor(private readonly payments: PaymentsRepository) {
    super();
  }

  async applySuccessfulPayment(
    payment: SuccessfulPayment,
    tx: PaymentsTransactionContext,
  ): Promise<ApplySuccessfulPaymentResult> {
    const persistedPayment = await this.payments.findById(payment.paymentId, tx);
    const subscriptionId = persistedPayment?.subscriptionId ?? randomUUID();
    if (payment.type === PaymentType.RENEWAL && !persistedPayment?.subscriptionId)
      throw new Error(`Renewal Payment ${payment.paymentId} has no Subscription`);

    return {
      subscriptionId,
      action: payment.type === PaymentType.RENEWAL ? 'RENEWED' : 'CREATED',
      paidUntil: this.calculatePaidUntil(payment).toISOString(),
      previousProviderSubscriptionId: null,
    };
  }

  async markProviderSubscriptionCancellationScheduled(
    _subscriptionId: string,
    _providerSubscriptionId: string,
    _tx: PaymentsTransactionContext,
  ): Promise<void> {
    // Temporary D2 adapter has no Subscription persistence to update.
  }

  async bindProviderSubscription(
    _paymentId: string,
    _subscriptionId: string,
    _providerSubscriptionId: string,
    _tx: PaymentsTransactionContext,
  ): Promise<void> {
    // Temporary D2 adapter has no Subscription persistence to update.
  }

  private calculatePaidUntil(payment: SuccessfulPayment): Date {
    const paidAt = new Date(payment.paidAt);
    const result = new Date(paidAt);

    if (payment.periodUnit === PeriodUnit.DAY) {
      result.setUTCDate(result.getUTCDate() + payment.periodCount);
      return result;
    }
    if (payment.periodUnit === PeriodUnit.WEEK) {
      result.setUTCDate(result.getUTCDate() + payment.periodCount * 7);
      return result;
    }

    const originalDay = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + payment.periodCount);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(originalDay, lastDay));
    return result;
  }
}
