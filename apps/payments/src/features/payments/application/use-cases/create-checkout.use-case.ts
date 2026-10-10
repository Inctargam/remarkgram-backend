import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  PaymentCheckoutReconciliationRequiredError,
  PaymentIdempotencyConflictError,
  PaymentInconsistentStateError,
  PaymentInitialReservationConflictError,
  PaymentPersistenceError,
  PaymentPlanUnavailableError,
  PaymentProviderOutcomeUnknownError,
  PaymentProviderUnavailableError,
  PaymentProviderValidationError,
  PaymentsError,
  PaymentSubscriptionContextError,
} from '../../../../common/application/errors/payments.error.js';
import { PlansRepository } from '../../../plans/application/ports/plans.repository.js';
import { PaymentProviderFactory } from '../../domain/payment-provider.factory.js';
import { CheckoutPurpose, Payment, PaymentStatus } from '../../domain/payment.entity.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PaymentsRepository } from '../ports/payments.repository.js';
import type { SubscriptionContextPort } from '../ports/subscription-context.port.js';
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
    private readonly subscription: SubscriptionContextPort,
  ) {}

  async execute(command: CreateCheckoutCommand): Promise<CreateCheckoutOutput> {
    const input = command.input;
    const providerType = PaymentProviderFactory.create(input.provider);
    let payment = await this.findExisting(input.userId, input.idempotencyKey);
    if (payment) {
      this.assertSameFingerprint(payment, input, providerType);
      const existingResult = this.resultForExisting(payment);
      if (existingResult) return existingResult;
    } else {
      const plan = await this.loadPlan(input.planId);
      const context = await this.loadSubscriptionContext(input.userId);
      const candidate = Payment.create({
        userId: input.userId,
        planId: plan.id,
        amount: plan.price,
        currency: plan.currency,
        periodCount: plan.periodCount,
        periodUnit: plan.periodUnit,
        providerType,
        idempotentKey: input.idempotencyKey,
        checkoutPurpose:
          context.kind === 'FIRST_PURCHASE'
            ? CheckoutPurpose.INITIAL_SUBSCRIPTION
            : CheckoutPurpose.SUBSCRIPTION_EXTENSION,
        autoRenewalRequested: input.autoRenewal,
        targetSubscriptionId: context.kind === 'ADDITIONAL_PURCHASE' ? context.subscriptionId : null,
      });
      const created = await this.createPayment(candidate);
      if (created.outcome === 'INITIAL_RESERVATION_CONFLICT')
        throw new PaymentInitialReservationConflictError();
      payment = created.payment;
      this.assertSameFingerprint(payment, input, providerType);
      const concurrentResult = this.resultForExisting(payment);
      if (concurrentResult) return concurrentResult;
    }

    this.assertRecoverableCreatedState(payment);
    const customer = await this.customerService.getOrCreate({
      userId: payment.userId,
      providerType: payment.providerType,
    });
    let result: Awaited<ReturnType<PaymentProviderPort['createCheckout']>>;
    try {
      result = await this.provider.createCheckout({
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        periodCount: payment.periodCount,
        periodUnit: payment.periodUnit,
        idempotencyKey: `checkout:${payment.providerType}:${payment.id}`,
        customerId: customer.providerCustomerId,
        checkoutPurpose: payment.checkoutPurpose!,
      });
    } catch {
      throw new PaymentProviderOutcomeUnknownError();
    }
    if (result.outcome === 'VALIDATION_ERROR') {
      await this.markDeterministicFailure(payment.id);
      throw new PaymentProviderValidationError(result.message);
    }
    if (result.outcome === 'UNAVAILABLE') throw new PaymentProviderUnavailableError();
    if (result.outcome === 'UNKNOWN') throw new PaymentProviderOutcomeUnknownError();

    const checkout = result.checkout;
    let attached;
    try {
      attached = await this.payments.attachCheckout(payment.id, {
        ...checkout,
        snapshot: { ...checkout.snapshot, checkoutUrl: checkout.checkoutUrl },
      });
    } catch {
      throw new PaymentPersistenceError();
    }
    if (attached.outcome === 'ATTACHED' || attached.outcome === 'ALREADY_ATTACHED')
      return this.mapStoredResult(attached.payment);
    throw new PaymentCheckoutReconciliationRequiredError();
  }

  private async findExisting(userId: number, idempotencyKey: string): Promise<Payment | null> {
    try {
      return await this.payments.findByUserAndIdempotency(userId, idempotencyKey);
    } catch {
      throw new PaymentPersistenceError();
    }
  }
  private async loadPlan(planId: number) {
    try {
      return await this.plans.getByIdOrThrow(planId);
    } catch (error) {
      if (error instanceof PaymentsError) throw error;
      throw new PaymentPlanUnavailableError();
    }
  }
  private async loadSubscriptionContext(userId: number) {
    try {
      return await this.subscription.getPurchaseContext(userId);
    } catch {
      throw new PaymentSubscriptionContextError();
    }
  }
  private async createPayment(payment: Payment) {
    try {
      return await this.payments.create(payment);
    } catch {
      throw new PaymentPersistenceError();
    }
  }
  private async markDeterministicFailure(paymentId: string): Promise<void> {
    try {
      await this.payments.markStatus(paymentId, PaymentStatus.FAILED);
    } catch {
      throw new PaymentPersistenceError();
    }
  }

  private resultForExisting(payment: Payment): CreateCheckoutOutput | null {
    if (payment.status === PaymentStatus.CREATED) return null;
    if (payment.status === PaymentStatus.PENDING) return this.mapStoredResult(payment);
    if ([PaymentStatus.SUCCEEDED, PaymentStatus.FAILED, PaymentStatus.CANCELED].includes(payment.status))
      return { paymentId: payment.id, checkoutUrl: null, status: payment.status };
    throw new PaymentInconsistentStateError(payment.id);
  }
  private mapStoredResult(payment: Payment): CreateCheckoutOutput {
    const checkoutUrl = payment.providerSnapshot?.checkoutUrl;
    if (
      payment.status !== PaymentStatus.PENDING ||
      !payment.providerCheckoutId ||
      !payment.providerCustomerId ||
      !payment.checkoutExpiresAt ||
      typeof checkoutUrl !== 'string' ||
      checkoutUrl.length === 0
    )
      throw new PaymentInconsistentStateError(payment.id);
    return { paymentId: payment.id, checkoutUrl, status: payment.status };
  }
  private assertRecoverableCreatedState(payment: Payment): void {
    if (
      payment.status !== PaymentStatus.CREATED ||
      payment.providerCheckoutId !== null ||
      payment.providerPaymentId !== null ||
      payment.providerSubscriptionId !== null ||
      payment.providerInvoiceId !== null ||
      payment.providerCustomerId !== null ||
      payment.checkoutExpiresAt !== null ||
      payment.providerSnapshot !== null ||
      payment.checkoutPurpose === null
    )
      throw new PaymentInconsistentStateError(payment.id);
  }
  private assertSameFingerprint(
    payment: Payment,
    input: CreateCheckoutInput,
    providerType: Payment['providerType'],
  ): void {
    if (
      payment.planId !== input.planId ||
      payment.providerType !== providerType ||
      payment.autoRenewalRequested !== input.autoRenewal
    )
      throw new PaymentIdempotencyConflictError();
  }
}
