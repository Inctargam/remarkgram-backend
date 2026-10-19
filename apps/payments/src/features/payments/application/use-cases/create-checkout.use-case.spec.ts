import { describe, expect, it, vi } from 'vitest';
import {
  PaymentCheckoutReconciliationRequiredError,
  PaymentIdempotencyConflictError,
  PaymentInitialReservationConflictError,
} from '../../../../common/application/errors/payments.error.js';
import type { PlansRepository } from '../../../plans/application/ports/plans.repository.js';
import { Currency, PeriodUnit, Plan } from '../../../plans/domain/plan.entity.js';
import {
  CheckoutPurpose,
  Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
  type RestorePaymentProps,
} from '../../domain/payment.entity.js';
import type { PaymentProviderPort } from '../ports/payment-provider.js';
import type { PaymentsRepository } from '../ports/payments.repository.js';
import type { SubscriptionContextPort } from '../ports/subscription-context.port.js';
import type { PaymentCustomerService } from '../services/payment-customer.service.js';
import { CreateCheckoutCommand, CreateCheckoutUseCase } from './create-checkout.use-case.js';

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
    const stored: { payment?: Payment } = {};
    const payments = {
      findByUserAndIdempotency: vi.fn().mockResolvedValue(null),
      create: vi.fn<PaymentsRepository['create']>((payment) => {
        stored.payment = payment;
        return Promise.resolve({ outcome: 'CREATED', payment: PaymentWithCreatedAt(payment) });
      }),
      attachCheckout: vi.fn<PaymentsRepository['attachCheckout']>((_id, checkout) =>
        Promise.resolve({
          outcome: 'ATTACHED',
          payment: PaymentWithCreatedAt(stored.payment!, {
            providerCheckoutId: checkout.checkoutId,
            providerPaymentId: checkout.providerPaymentId,
            providerSubscriptionId: checkout.providerSubscriptionId,
            providerInvoiceId: checkout.providerInvoiceId,
            providerCustomerId: checkout.providerCustomerId,
            checkoutExpiresAt: checkout.checkoutExpiresAt,
            providerSnapshot: checkout.snapshot,
            status: PaymentStatus.PENDING,
          }),
        }),
      ),
    } as unknown as PaymentsRepository;
    const createCheckout = vi.fn<PaymentProviderPort['createCheckout']>().mockResolvedValue({
      checkout: {
        checkoutId: 'cs_test',
        checkoutUrl: 'https://checkout.stripe.com/test',
        providerPaymentId: 'pi_test',
        providerSubscriptionId: null,
        providerInvoiceId: null,
        providerCustomerId: 'cus_test',
        checkoutExpiresAt: new Date('2030-01-01T00:00:00Z'),
        snapshot: {},
      },
    });
    const provider = { createCheckout } as unknown as PaymentProviderPort;
    const useCase = new CreateCheckoutUseCase(
      { getByIdOrThrow: vi.fn().mockResolvedValue(plan) } as unknown as PlansRepository,
      payments,
      provider,
      customerService(),
      subscriptionContext(),
    );

    const result = await useCase.execute(new CreateCheckoutCommand(input));
    expect(typeof result.paymentId).toBe('string');
    expect(result).toMatchObject({
      checkoutUrl: 'https://checkout.stripe.com/test',
      status: PaymentStatus.PENDING,
    });
    expect(createCheckout).toHaveBeenCalledOnce();
    const createCheckoutParams = createCheckout.mock.calls[0]?.[0];
    expect(createCheckoutParams).toMatchObject({
      amount: 10_000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.MONTH,
      customerId: 'cus_test',
    });
    // Application passes a stable operation identity; the provider adapter owns the key prefix.
    expect(typeof createCheckoutParams?.operationId).toBe('string');
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

  it('maps an occupied initial reservation to a stable application conflict', async () => {
    const existing = initialPayment('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const useCase = checkoutUseCase({
      create: vi.fn().mockResolvedValue({
        outcome: 'INITIAL_RESERVATION_CONFLICT',
        payment: existing,
      }),
    });

    await expect(useCase.execute(new CreateCheckoutCommand(input))).rejects.toBeInstanceOf(
      PaymentInitialReservationConflictError,
    );
  });

  it('recovers the winner of a concurrent create with the same key', async () => {
    const existing = initialPayment(input.idempotencyKey);
    const provider = providerPort();
    const useCase = checkoutUseCase(
      {
        create: vi.fn().mockResolvedValue({ outcome: 'IDEMPOTENCY_CONFLICT', payment: existing }),
        attachCheckout: vi.fn().mockResolvedValue({
          outcome: 'ALREADY_ATTACHED',
          payment: Payment.restore({
            ...paymentShape(existing),
            providerCheckoutId: 'cs_test',
            providerCustomerId: 'cus_test',
            checkoutExpiresAt: new Date('2030-01-01T00:00:00Z'),
            providerSnapshot: { checkoutUrl: 'https://checkout.stripe.com/test' },
            status: PaymentStatus.PENDING,
          }),
        }),
      },
      provider,
    );

    await expect(useCase.execute(new CreateCheckoutCommand(input))).resolves.toMatchObject({
      paymentId: existing.id,
      status: PaymentStatus.PENDING,
    });
  });

  it('does not hide an attach correlation conflict as provider unavailability', async () => {
    const existing = initialPayment(input.idempotencyKey);
    const useCase = checkoutUseCase({
      create: vi.fn().mockResolvedValue({ outcome: 'CREATED', payment: existing }),
      attachCheckout: vi.fn().mockResolvedValue({ outcome: 'CHECKOUT_CONFLICT' }),
    });

    await expect(useCase.execute(new CreateCheckoutCommand(input))).rejects.toBeInstanceOf(
      PaymentCheckoutReconciliationRequiredError,
    );
  });
});

function checkoutUseCase(
  repository: Partial<PaymentsRepository>,
  provider: PaymentProviderPort = providerPort(),
): CreateCheckoutUseCase {
  const plan = Plan.restore({
    id: 3,
    price: 10_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
  });
  return new CreateCheckoutUseCase(
    { getByIdOrThrow: vi.fn().mockResolvedValue(plan) } as unknown as PlansRepository,
    {
      findByUserAndIdempotency: vi.fn().mockResolvedValue(null),
      ...repository,
    } as unknown as PaymentsRepository,
    provider,
    customerService(),
    subscriptionContext(),
  );
}

function providerPort(): PaymentProviderPort {
  return {
    createCheckout: vi.fn().mockResolvedValue({
      checkout: {
        checkoutId: 'cs_test',
        checkoutUrl: 'https://checkout.stripe.com/test',
        providerPaymentId: null,
        providerSubscriptionId: null,
        providerInvoiceId: null,
        providerCustomerId: 'cus_test',
        checkoutExpiresAt: new Date('2030-01-01T00:00:00Z'),
        snapshot: {},
      },
    }),
  } as unknown as PaymentProviderPort;
}

function initialPayment(idempotentKey: string): Payment {
  return PaymentWithCreatedAt(
    Payment.create({
      userId: input.userId,
      planId: input.planId,
      amount: 10_000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.MONTH,
      providerType: PaymentProvider.STRIPE,
      idempotentKey,
      checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
      autoRenewalRequested: input.autoRenewal,
      targetSubscriptionId: null,
    }),
  );
}

function customerService(): PaymentCustomerService {
  return {
    getOrCreate: vi.fn().mockResolvedValue({ providerCustomerId: 'cus_test' }),
  } as unknown as PaymentCustomerService;
}

function subscriptionContext(): SubscriptionContextPort {
  return {
    findActiveSubscriptionForPurchase: vi.fn().mockResolvedValue(null),
  };
}

function PaymentWithCreatedAt(
  payment: Parameters<PaymentsRepository['create']>[0],
  override: Partial<RestorePaymentProps> = {},
) {
  return Payment.restore({ ...paymentShape(payment), ...override });
}
function paymentShape(payment: Parameters<PaymentsRepository['create']>[0]): RestorePaymentProps {
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
