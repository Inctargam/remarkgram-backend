import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit, Plan } from '../../../plans/domain/plan.entity.js';
import { Payment, PaymentProvider, PaymentStatus } from '../../domain/payment.entity.js';
import type { PlansRepository } from '../../../plans/application/ports/plans.repository.js';
import type { PaymentsRepository } from '../ports/payments.repository.js';
import type { PaymentProviderPort } from '../ports/payment-provider.js';
import { CreateCheckoutUseCase } from './create-checkout.use-case.js';
import { PaymentIdempotencyConflictError } from '../errors/payment-use-case.errors.js';

const input = { userId: 42, planId: 3, idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

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
          providerPaymentId: checkout.paymentId,
          providerSnapshot: checkout.snapshot,
          status: PaymentStatus.PENDING,
        }),
      ),
    } as unknown as PaymentsRepository;
    const provider = {
      createCheckout: vi
        .fn()
        .mockResolvedValue({
          checkoutId: 'cs_test',
          checkoutUrl: 'https://checkout.stripe.com/test',
          paymentId: 'pi_test',
          snapshot: {},
        }),
    } as unknown as PaymentProviderPort;
    const useCase = new CreateCheckoutUseCase(
      { findById: vi.fn().mockResolvedValue(plan) } as unknown as PlansRepository,
      payments,
      provider,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      paymentId: expect.any(String),
      checkoutUrl: 'https://checkout.stripe.com/test',
      status: PaymentStatus.PENDING,
    });
    expect(provider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10_000, currency: Currency.USD }),
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
      }),
    );
    const useCase = new CreateCheckoutUseCase(
      {} as PlansRepository,
      { findByUserAndIdempotency: vi.fn().mockResolvedValue(existing) } as unknown as PaymentsRepository,
      {} as PaymentProviderPort,
    );
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(PaymentIdempotencyConflictError);
  });
});

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
    providerSnapshot: null,
    subscriptionId: null,
    status: PaymentStatus.CREATED,
    createdAt: new Date(),
    paidAt: null,
  };
}
