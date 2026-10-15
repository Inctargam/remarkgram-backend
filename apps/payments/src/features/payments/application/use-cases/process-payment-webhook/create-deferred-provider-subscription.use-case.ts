import { Injectable } from '@nestjs/common';
import { PaymentSubscriptionApplicationConflictError } from '../../errors/payment.errors.js';
import { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import { PaymentProviderPort } from '../../ports/payment-provider.js';
import { PaymentsRepository } from '../../ports/payments.repository.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { SubscriptionPaymentHandler } from '../../ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../types/successful-payment.types.js';

export type CreateDeferredProviderSubscriptionParams = {
  eventId: string;
  payment: SuccessfulPayment;
  subscriptionId: string;
  nextSubscriptionStartsAt: string;
  previousProviderSubscriptionId: string;
};

export type CreatedDeferredProviderSubscription = {
  providerSubscriptionId: string;
};

/** Workflow step behavior for creating and binding the replacement provider Subscription. */
@Injectable()
export class CreateDeferredProviderSubscriptionUseCase {
  constructor(
    private readonly provider: PaymentProviderPort,
    private readonly payments: PaymentsRepository,
    private readonly subscriptions: SubscriptionPaymentHandler,
    private readonly events: PaymentEventRepository,
  ) {}

  async createAtProvider(
    params: CreateDeferredProviderSubscriptionParams,
  ): Promise<CreatedDeferredProviderSubscription> {
    const customerId = params.payment.providerCustomerId;
    if (!customerId)
      throw new PaymentSubscriptionApplicationConflictError(
        params.payment.paymentId,
        'PROVIDER_CUSTOMER_MISSING',
      );

    const result = await this.provider.createDeferredSubscription({
      paymentId: params.payment.paymentId,
      subscriptionId: params.subscriptionId,
      customerId,
      amount: params.payment.amount,
      currency: params.payment.currency,
      periodCount: params.payment.periodCount,
      periodUnit: params.payment.periodUnit,
      billingCycleAnchor: params.nextSubscriptionStartsAt,
      operationId: params.payment.paymentId,
    });
    if (!result.providerSubscriptionId.trim())
      throw new PaymentSubscriptionApplicationConflictError(
        params.payment.paymentId,
        'INVALID_PROVIDER_RESULT',
      );
    return result;
  }

  async recordCreated(
    params: CreateDeferredProviderSubscriptionParams,
    created: CreatedDeferredProviderSubscription,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    const bound = await this.payments.bindPaymentProviderSubscription(
      {
        paymentId: params.payment.paymentId,
        subscriptionId: params.subscriptionId,
        providerSubscriptionId: created.providerSubscriptionId,
      },
      tx,
    );
    if (bound.outcome !== 'BOUND')
      throw new PaymentSubscriptionApplicationConflictError(
        params.payment.paymentId,
        'PROVIDER_SUBSCRIPTION_LINK_CONFLICT',
      );

    await this.subscriptions.bindProviderSubscription(
      params.payment.paymentId,
      params.subscriptionId,
      created.providerSubscriptionId,
      tx,
    );
    await this.events.markProcessed(params.eventId, tx);
  }
}
