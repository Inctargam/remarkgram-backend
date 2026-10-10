import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PlansRepository } from '../../../plans/application/ports/plans.repository.js';
import { CheckoutPurpose, Payment, PaymentProvider, PaymentStatus } from '../../domain/payment.entity.js';
import { PaymentProviderFactory } from '../../domain/payment-provider.factory.js';
import {
  PaymentIdempotencyConflictError,
  PaymentProviderUnavailableError,
} from '../../../../common/application/errors/payments.error.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PaymentsRepository } from '../ports/payments.repository.js';
import type { SubscriptionContextPort } from '../ports/subscription-context.port.ts';
import { PaymentCustomerService } from '../services/payment-customer.service.js';

export type CreateCheckoutInput = {
  userId: number;
  planId: number;
  idempotencyKey: string;
  provider: string;
  autoRenewal: boolean;
};
export type CreateCheckoutOutput = { paymentId: string; checkoutUrl: string | null; status: PaymentStatus };

export class CreateCheckoutCommand extends Command<CreateCheckoutOutput> {
  constructor(public readonly input: CreateCheckoutInput) {
    super();
  }
}

@CommandHandler(CreateCheckoutCommand)
export class CreateCheckoutUseCase implements ICommandHandler<CreateCheckoutCommand> {
  constructor(
    private readonly plans: PlansRepository,
    private readonly payments: PaymentsRepository,
    private readonly provider: PaymentProviderPort,
    private readonly customerService: PaymentCustomerService,
    private readonly subsctiption: SubscriptionContextPort,
  ) {}
  private mapToResult(payment: Payment): CreateCheckoutOutput {
    const snapshotCheckoutUrl = payment.providerSnapshot?.checkoutUrl;
    const checkoutUrl = typeof snapshotCheckoutUrl === 'string' ? snapshotCheckoutUrl : null;
    return {
      paymentId: payment.id,
      checkoutUrl: [PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status)
        ? checkoutUrl
        : null,
      status: payment.status,
    };
  }

  async execute(command: CreateCheckoutCommand): Promise<CreateCheckoutOutput> {
    const input = command.input;
    const { userId, idempotencyKey, planId } = input;

    const providerType = PaymentProviderFactory.create(input.provider);
    if (providerType !== PaymentProvider.STRIPE) throw new PaymentProviderUnavailableError();
    // Один ключ обозначает одну попытку покупки
    let payment = await this.payments.findByUserAndIdempotency(userId, idempotencyKey);

    if (
      payment &&
      (payment.planId !== input.planId ||
        payment.providerType !== providerType ||
        payment.autoRenewalRequested !== input.autoRenewal)
    ) {
      throw new PaymentIdempotencyConflictError();
    }

    // Повтор неизменённого запроса возвращает сохранённый результат; терминальное состояние
    // не запускает новый Checkout.
    if (payment && payment.status !== PaymentStatus.CREATED) return this.mapToResult(payment);

    if (!payment) {
      const plan = await this.plans.getByIdOrThrow(planId);
      const localSubscription = await this.subsctiption.getPurchaseContext(userId);
      const newPayment = Payment.create({
        userId: input.userId,
        planId: plan.id,
        amount: plan.price,
        currency: plan.currency,
        periodCount: plan.periodCount,
        periodUnit: plan.periodUnit,
        providerType,
        idempotentKey: input.idempotencyKey,
        checkoutPurpose:
          localSubscription.kind === 'FIRST_PURCHASE'
            ? CheckoutPurpose.INITIAL_SUBSCRIPTION
            : CheckoutPurpose.SUBSCRIPTION_EXTENSION,
        autoRenewalRequested: input.autoRenewal,
        targetSubscriptionId:
          localSubscription.kind === 'ADDITIONAL_PURCHASE' ? localSubscription.subscriptionId : null,
      });
      try {
        payment = await this.payments.create(newPayment);
      } catch (error) {
        payment = await this.payments.findByUserAndIdempotency(input.userId, input.idempotencyKey);
        if (!payment) throw error;
        if (payment.planId !== input.planId) throw new PaymentIdempotencyConflictError();
      }
    }
    const customer = await this.customerService.getOrCreate({ userId: input.userId });
    // Payment может остаться в статусе Created это один из вариантов точки отказа. Тогда для этого платежа нужно так же сформировать checkout
    try {
      const checkout = await this.provider.createCheckout({
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        periodCount: payment.periodCount,
        periodUnit: payment.periodUnit,
        idempotencyKey: payment.idempotentKey,
        customerId: customer.providerCustomerId,
        checkoutPurpose: payment.checkoutPurpose!,
      });
      const saved = await this.payments.attachCheckout(payment.id, {
        ...checkout,
        snapshot: { ...checkout.snapshot, checkoutUrl: checkout.checkoutUrl },
      });
      return { paymentId: saved.id, checkoutUrl: checkout.checkoutUrl, status: saved.status };
    } catch {
      throw new PaymentProviderUnavailableError();
    }
  }
}
