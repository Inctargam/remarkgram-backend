import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';
import {
  type ApplySuccessfulPaymentResult,
  SubscriptionPaymentHandler,
} from '../../../payments/application/ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../../payments/application/types/successful-payment.types.js';
import { ApplySuccessfulPaymentCommand } from '../../application/use-cases/apply-successful-payment/apply-successful-payment.use-case.js';
import { ConfirmAutoRenewalCancellationCommand } from '../../application/use-cases/confirm-auto-renewal-cancellation/confirm-auto-renewal-cancellation.use-case.js';
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

  confirmAutoRenewalCancellation(
    paymentId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    return this.commandBus.execute(
      new ConfirmAutoRenewalCancellationCommand(paymentId, providerSubscriptionId, tx),
    );
  }

  bindProviderSubscription(
    paymentId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    return this.commandBus.execute(
      new BindProviderSubscriptionCommand(paymentId, providerSubscriptionId, tx),
    );
  }
}
