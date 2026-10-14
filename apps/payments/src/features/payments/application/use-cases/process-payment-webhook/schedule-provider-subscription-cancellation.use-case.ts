import { Injectable } from '@nestjs/common';
import {
  PaymentProviderPort,
  type ScheduleProviderSubscriptionCancellationResult as ProviderCancellationResult,
} from '../../ports/payment-provider.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { SubscriptionPaymentHandler } from '../../ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../types/successful-payment.types.js';

export type ScheduleProviderSubscriptionCancellationParams = {
  eventId: string;
  payment: SuccessfulPayment;
  subscriptionId: string;
  paidUntil: string;
  previousProviderSubscriptionId: string;
};

export type ScheduleProviderSubscriptionCancellationResult =
  ScheduleProviderSubscriptionCancellationParams & {
    providerCurrentPeriodEnd: string | null;
  };

/** Workflow step behavior for retiring the previous provider Subscription. */
@Injectable()
export class ScheduleProviderSubscriptionCancellationUseCase {
  constructor(
    private readonly provider: PaymentProviderPort,
    private readonly subscriptions: SubscriptionPaymentHandler,
  ) {}

  async scheduleAtProvider(
    params: ScheduleProviderSubscriptionCancellationParams,
  ): Promise<ScheduleProviderSubscriptionCancellationResult> {
    const result = await this.provider.scheduleSubscriptionCancellation(
      params.previousProviderSubscriptionId,
    );
    this.assertProviderResult(params, result);
    return { ...params, providerCurrentPeriodEnd: result.currentPeriodEnd };
  }

  recordScheduled(
    params: ScheduleProviderSubscriptionCancellationParams,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    return this.subscriptions.markProviderSubscriptionCancellationScheduled(
      params.subscriptionId,
      params.previousProviderSubscriptionId,
      tx,
    );
  }

  private assertProviderResult(
    params: ScheduleProviderSubscriptionCancellationParams,
    result: ProviderCancellationResult,
  ): void {
    if (
      result.providerSubscriptionId !== params.previousProviderSubscriptionId ||
      result.cancelAtPeriodEnd !== true
    )
      throw new Error(
        `Provider did not schedule cancellation for Subscription ${params.previousProviderSubscriptionId}`,
      );
  }
}
