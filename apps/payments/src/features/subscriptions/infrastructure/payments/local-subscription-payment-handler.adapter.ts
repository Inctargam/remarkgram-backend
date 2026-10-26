import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';
import {
  type ApplySuccessfulPaymentResult,
  SubscriptionPaymentHandler,
} from '../../../payments/application/ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../../payments/application/types/successful-payment.types.js';
import { ApplySuccessfulPaymentCommand } from '../../application/use-cases/apply-successful-payment/apply-successful-payment.use-case.js';
import { MarkProviderSubscriptionCancellationScheduledCommand } from '../../application/use-cases/mark-provider-subscription-cancellation-scheduled/mark-provider-subscription-cancellation-scheduled.use-case.js';
import { BindProviderSubscriptionCommand } from '../../application/use-cases/bind-provider-subscription/bind-provider-subscription.use-case.js';

@Injectable()
export class LocalSubscriptionPaymentHandlerAdapter extends SubscriptionPaymentHandler {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  applySuccessfulPayment(
    payment: SuccessfulPayment,
    tx: PaymentsTransactionContext,
  ): Promise<ApplySuccessfulPaymentResult> {
    return this.commandBus.execute(new ApplySuccessfulPaymentCommand(payment, tx));
  }

  markProviderSubscriptionCancellationScheduled(
    subscriptionId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    return this.commandBus.execute(
      new MarkProviderSubscriptionCancellationScheduledCommand(subscriptionId, providerSubscriptionId, tx),
    );
  }

  bindProviderSubscription(
    paymentId: string,
    subscriptionId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    return this.commandBus.execute(
      new BindProviderSubscriptionCommand(paymentId, subscriptionId, providerSubscriptionId, tx),
    );
  }
}
