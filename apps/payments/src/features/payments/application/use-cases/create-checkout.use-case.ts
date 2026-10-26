import { Logger } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  PaymentCheckoutReconciliationRequiredError,
  PaymentIdempotencyConflictError,
  PaymentInconsistentStateError,
  PaymentInitialReservationConflictError,
  PaymentPersistenceError,
  PaymentPlanUnavailableError,
  PaymentsError,
  PaymentSubscriptionContextError,
} from '../../../../common/application/errors/payments.error.js';
import { PlansRepository } from '../../../plans/application/ports/plans.repository.js';
import { PaymentProviderFactory } from '../../domain/payment-provider.factory.js';
import { CheckoutPurpose, Payment, PaymentStatus } from '../../domain/payment.entity.js';
import { PaymentProviderOutcomeUnknownError } from '../errors/payment-provider.error.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PaymentsRepository } from '../ports/payments.repository.js';
import { SubscriptionContextPort } from '../ports/subscription-context.port.js';
import { PaymentCustomerService } from '../services/payment-customer.service.js';

export type CreateCheckoutInput = {
  userId: number;
  planId: number;
  idempotencyKey: string;
  provider: string;
  autoRenewal: boolean;
};
export type CreateCheckoutOutput = { paymentId: string; checkoutUrl: string | null; status: PaymentStatus };
type PaymentResolution =
  | { kind: 'CONTINUE'; payment: Payment }
  | { kind: 'RETURN'; result: CreateCheckoutOutput };

export class CreateCheckoutCommand extends Command<CreateCheckoutOutput> {
  constructor(public readonly input: CreateCheckoutInput) {
    super();
  }
}

@CommandHandler(CreateCheckoutCommand)
export class CreateCheckoutUseCase implements ICommandHandler<CreateCheckoutCommand> {
  private readonly logger = new Logger(CreateCheckoutUseCase.name);

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
    const resolution = await this.resolvePayment(input, providerType);
    if (resolution.kind === 'RETURN') return resolution.result;
    return this.createAndAttachCheckout(resolution.payment);
  }

  private async resolvePayment(
    input: CreateCheckoutInput,
    providerType: Payment['providerType'],
  ): Promise<PaymentResolution> {
    let payment: Payment | null;
    try {
      payment = await this.payments.findByUserAndIdempotency(input.userId, input.idempotencyKey);
    } catch (e) {
      console.error(e);
      throw new PaymentPersistenceError();
    }

    if (!payment) return this.createNewPayment(input, providerType);

    this.assertSameFingerprint(payment, input, providerType);
    const existingResult = this.mapExistingPayment(payment);
    return existingResult ? { kind: 'RETURN', result: existingResult } : { kind: 'CONTINUE', payment };
  }

  private async createNewPayment(
    input: CreateCheckoutInput,
    providerType: Payment['providerType'],
  ): Promise<PaymentResolution> {
    let plan: Awaited<ReturnType<PlansRepository['getByIdOrThrow']>>;
    try {
      plan = await this.plans.getByIdOrThrow(input.planId);
    } catch (error) {
      if (error instanceof PaymentsError) throw error;
      throw new PaymentPlanUnavailableError();
    }

    let hasActiveSubscription: Awaited<ReturnType<SubscriptionContextPort['hasActiveSubscription']>>;
    try {
      hasActiveSubscription = await this.subscription.hasActiveSubscription(input.userId);
    } catch {
      throw new PaymentSubscriptionContextError();
    }

    const candidate = Payment.create({
      userId: input.userId,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency,
      periodCount: plan.periodCount,
      periodUnit: plan.periodUnit,
      providerType,
      idempotentKey: input.idempotencyKey,
      checkoutPurpose: hasActiveSubscription
        ? CheckoutPurpose.SUBSCRIPTION_EXTENSION
        : CheckoutPurpose.INITIAL_SUBSCRIPTION,
      autoRenewalRequested: input.autoRenewal,
    });

    let created: Awaited<ReturnType<PaymentsRepository['create']>>;
    try {
      created = await this.payments.create(candidate);
    } catch {
      throw new PaymentPersistenceError();
    }
    if (created.outcome === 'INITIAL_RESERVATION_CONFLICT') {
      throw new PaymentInitialReservationConflictError();
    }

    const payment = created.payment;
    this.assertSameFingerprint(payment, input, providerType);
    const concurrentResult = this.mapExistingPayment(payment);
    return concurrentResult ? { kind: 'RETURN', result: concurrentResult } : { kind: 'CONTINUE', payment };
  }

  private async createAndAttachCheckout(payment: Payment): Promise<CreateCheckoutOutput> {
    this.assertCanCreateCheckoutForPayment(payment);
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
        operationId: payment.id,
        customerId: customer.providerCustomerId,
        checkoutPurpose: payment.checkoutPurpose!,
      });
    } catch (error) {
      if (error instanceof PaymentsError) throw error;
      this.logger.error({
        event: 'payment_provider_contract_violation',
        operation: 'CREATE_CHECKOUT',
        paymentId: payment.id,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw new PaymentProviderOutcomeUnknownError();
    }
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
    if (attached.outcome === 'ATTACHED' || attached.outcome === 'ALREADY_ATTACHED') {
      return this.mapStoredResult(attached.payment);
    }
    throw new PaymentCheckoutReconciliationRequiredError();
  }

  private mapExistingPayment(payment: Payment): CreateCheckoutOutput | null {
    if (payment.status === PaymentStatus.CREATED) return null;
    if (payment.status === PaymentStatus.PENDING) return this.mapStoredResult(payment);
    // создавать новый Checkout для этой же записи нельзя так как snapshot и времени оплаты начнут противоречить друг другу.
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
    ) {
      throw new PaymentInconsistentStateError(payment.id);
    }
    return { paymentId: payment.id, checkoutUrl, status: payment.status };
  }

  // Checkout можно создавать только для чистого CREATED Payment.
  // Частично сохранённая provider-корреляция требует reconciliation,
  // а не повторного создания внешней финансовой операции.
  private assertCanCreateCheckoutForPayment(payment: Payment): void {
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
  // Один Idempotency-Key может продолжать только исходное пользовательское намерение.
  // Fingerprint проверяется до любого раннего возврата; сохранённые purpose и subscription context
  // при повторе не пересчитываются.
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
