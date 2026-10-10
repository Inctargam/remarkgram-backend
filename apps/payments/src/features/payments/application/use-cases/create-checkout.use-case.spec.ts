import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit, Plan } from '../../../plans/domain/plan.entity.js';
import {
  Payment,
  PaymentProvider,
  CheckoutPurpose,
  PaymentStatus,
  PaymentType,
} from '../../domain/payment.entity.js';
import type { PlansRepository } from '../../../plans/application/ports/plans.repository.js';
import type { PaymentsRepository } from '../ports/payments.repository.js';
import type { PaymentProviderPort } from '../ports/payment-provider.js';
import { CreateCheckoutCommand, CreateCheckoutUseCase } from './create-checkout.use-case.js';
import { PaymentIdempotencyConflictError } from '../../../../common/application/errors/payments.error.js';
import type { PaymentCustomerService } from '../services/payment-customer.service.js';
import type { SubscriptionContextPort } from '../ports/subscription-context.port.js';

const input = {
  userId: 42,
  planId: 3,
  idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  provider: 'STRIPE',
  autoRenewal: true,
};

describe('CreateCheckoutUseCase', () => {
  it('uses the server-side plan price and persists provider checkout', async () => {
    const plan = Plan.restore({
      id: 3,
      price: 10_000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.MONTH,
    });
    const stored: { payment?: Parameters<PaymentsRepository['create']>[0] } = {};
    const payments = {
      findByUserAndIdempotency: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (payment) => {
        stored.payment = payment;
        return PaymentWithCreatedAt(payment);
      }),
      attachCheckout: vi.fn(async (_id, checkout) =>
        PaymentWithCreatedAt(stored.payment!, {
          providerCheckoutId: checkout.checkoutId,
          providerPaymentId: checkout.providerPaymentId,
          providerSubscriptionId: checkout.providerSubscriptionId,
          providerInvoiceId: checkout.providerInvoiceId,
          providerCustomerId: checkout.providerCustomerId,
          checkoutExpiresAt: checkout.checkoutExpiresAt,
          providerSnapshot: checkout.snapshot,
          status: PaymentStatus.PENDING,
        }),
      ),
    } as unknown as PaymentsRepository;
    const provider = {
      createCheckout: vi.fn().mockResolvedValue({
        checkoutId: 'cs_test',
        checkoutUrl: 'https://checkout.stripe.com/test',
        providerPaymentId: 'pi_test',
        providerSubscriptionId: null,
        providerInvoiceId: null,
        providerCustomerId: 'cus_test',
        checkoutExpiresAt: new Date('2030-01-01T00:00:00Z'),
        snapshot: {},
      }),
    } as unknown as PaymentProviderPort;
    const useCase = new CreateCheckoutUseCase(
      { getByIdOrThrow: vi.fn().mockResolvedValue(plan) } as unknown as PlansRepository,
      payments,
      provider,
      customerService(),
      subscriptionContext(),
    );

    await expect(useCase.execute(new CreateCheckoutCommand(input))).resolves.toEqual({
      paymentId: expect.any(String),
      checkoutUrl: 'https://checkout.stripe.com/test',
      status: PaymentStatus.PENDING,
    });
    expect(provider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10_000,
        currency: Currency.USD,
        periodCount: 1,
        periodUnit: PeriodUnit.MONTH,
        customerId: 'cus_test',
      }),
    );
  });

  it('rejects reuse of a key for another plan', async () => {
    const existing = PaymentWithCreatedAt(
      Payment.create({
        userId: 42,
        planId: 2,
        amount: 100,
        currency: Currency.USD,
        periodCount: 1,
        periodUnit: PeriodUnit.MONTH,
        providerType: PaymentProvider.STRIPE,
        idempotentKey: input.idempotencyKey,
        checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
        autoRenewalRequested: true,
        targetSubscriptionId: null,
      }),
    );
    const useCase = new CreateCheckoutUseCase(
      {} as PlansRepository,
      { findByUserAndIdempotency: vi.fn().mockResolvedValue(existing) } as unknown as PaymentsRepository,
      {} as PaymentProviderPort,
      customerService(),
      subscriptionContext(),
    );
    await expect(useCase.execute(new CreateCheckoutCommand(input))).rejects.toBeInstanceOf(
      PaymentIdempotencyConflictError,
    );
  });
});

function customerService(): PaymentCustomerService {
  return {
    getOrCreate: vi.fn().mockResolvedValue({ providerCustomerId: 'cus_test' }),
  } as unknown as PaymentCustomerService;
}

function subscriptionContext(): SubscriptionContextPort {
  return {
    getPurchaseContext: vi.fn().mockResolvedValue({ kind: 'FIRST_PURCHASE' }),
  } as unknown as SubscriptionContextPort;
}

function PaymentWithCreatedAt(
  payment: Parameters<PaymentsRepository['create']>[0],
  override: Partial<ReturnType<typeof paymentShape>> = {},
) {
  return Payment.restore({ ...paymentShape(payment), ...override });
}
function paymentShape(payment: Parameters<PaymentsRepository['create']>[0]) {
  return {
    id: payment.id,
    userId: payment.userId,
    planId: payment.planId,
    amount: payment.amount,
    currency: payment.currency,
    periodCount: payment.periodCount,
    periodUnit: payment.periodUnit,
    providerType: payment.providerType,
    idempotentKey: payment.idempotentKey,
    providerCheckoutId: null,
    providerPaymentId: null,
    providerSubscriptionId: null,
    providerInvoiceId: null,
    providerCustomerId: null,
    checkoutExpiresAt: null,
    providerSnapshot: null,
    subscriptionId: null,
    targetSubscriptionId: payment.targetSubscriptionId,
    type: PaymentType.PURCHASE,
    status: PaymentStatus.CREATED,
    createdAt: new Date(),
    paidAt: null,
    checkoutPurpose: payment.checkoutPurpose,
    autoRenewalRequested: payment.autoRenewalRequested,
  };
}
