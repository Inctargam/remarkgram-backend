import { Injectable } from '@nestjs/common';
import { PaymentNotFoundError } from '../../../../../common/application/errors/payments.error.js';
import { PaymentStatus, PaymentType } from '../../../domain/payment.entity.js';
import { PaymentSubscriptionApplicationConflictError } from '../../errors/payment-subscription-application.error.js';
import { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../ports/payments.repository.js';
import { SubscriptionPaymentHandler } from '../../ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../types/successful-payment.types.js';

export type LinkPaymentToSubscriptionParams = {
  eventId: string;
  payment: SuccessfulPayment;
};

export type LinkPaymentToSubscriptionResult =
  | { outcome: 'FINISHED' }
  | {
      outcome: 'SCHEDULED';
      eventId: string;
      payment: SuccessfulPayment;
      subscriptionId: string;
      nextSubscriptionStartsAt: string;
      previousProviderSubscriptionId: string;
    };

/** Workflow step that links a financially successful Payment with the Subscription selected by D2. */
@Injectable()
export class LinkPaymentToSubscriptionUseCase {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly events: PaymentEventRepository,
    private readonly subscriptions: SubscriptionPaymentHandler,
  ) {}

  async execute(
    params: LinkPaymentToSubscriptionParams,
    ctx: PaymentsTransactionContext,
  ): Promise<LinkPaymentToSubscriptionResult> {
    const current = await this.payments.findById(params.payment.paymentId, ctx);
    if (!current) throw new PaymentNotFoundError(params.payment.paymentId);
    if (current.status !== PaymentStatus.SUCCEEDED)
      throw new PaymentSubscriptionApplicationConflictError(
        params.payment.paymentId,
        'PAYMENT_STATE_MISMATCH',
      );
    const applied = await this.subscriptions.applySuccessfulPayment(params.payment, ctx);
    this.assertHandlerResult(params.payment, applied);

    const linked = await this.payments.linkSuccessfulPaymentToSubscription(
      { paymentId: params.payment.paymentId, subscriptionId: applied.subscriptionId },
      ctx,
    );
    if (linked.outcome !== 'LINKED')
      throw new PaymentSubscriptionApplicationConflictError(
        params.payment.paymentId,
        'PAYMENT_LINK_CONFLICT',
      );

    await this.events.attachPayment(params.eventId, params.payment.paymentId, ctx);
    if (applied.action !== 'SCHEDULED') {
      await this.events.markProcessed(params.eventId, ctx);
      return { outcome: 'FINISHED' };
    }

    return {
      outcome: 'SCHEDULED',
      eventId: params.eventId,
      payment: params.payment,
      subscriptionId: applied.subscriptionId,
      nextSubscriptionStartsAt: applied.nextSubscriptionStartsAt,
      previousProviderSubscriptionId: applied.previousProviderSubscriptionId!,
    };
  }

  private assertHandlerResult(
    payment: SuccessfulPayment,
    result: Awaited<ReturnType<SubscriptionPaymentHandler['applySuccessfulPayment']>>,
  ): void {
    const nextSubscriptionStartsAt = new Date(result.nextSubscriptionStartsAt);
    const subscriptionIdPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const invalidAction =
      (payment.type === PaymentType.RENEWAL && result.action !== 'RENEWED') ||
      (payment.type === PaymentType.PURCHASE && result.action === 'RENEWED');
    if (
      !subscriptionIdPattern.test(result.subscriptionId) ||
      Number.isNaN(nextSubscriptionStartsAt.getTime()) ||
      nextSubscriptionStartsAt.toISOString() !== result.nextSubscriptionStartsAt ||
      invalidAction ||
      (result.action === 'SCHEDULED' && !result.previousProviderSubscriptionId?.trim())
    )
      throw new PaymentSubscriptionApplicationConflictError(payment.paymentId, 'INVALID_HANDLER_RESULT');
  }
}
