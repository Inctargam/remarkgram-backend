import { describe, expect, it, vi } from 'vitest';
import type { CheckoutSessionExpiredEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import {
  CheckoutPurpose,
  type Payment,
  PaymentProvider,
  PaymentStatus,
} from '../../../../domain/payment.entity.js';
import { CancelExpiredCheckoutSessionUseCase } from './cancel-expired-checkout-session.use-case.js';

describe('CancelExpiredCheckoutSessionUseCase', () => {
  it.each([PaymentStatus.CREATED, PaymentStatus.PENDING])(
    'cancels a compatible payment in %s',
    async (status) => {
      const payments = repository();
      payments.findById.mockResolvedValue(payment({ status }));
      payments.cancelPendingPayment.mockResolvedValue({ outcome: 'CANCELED' });
      const useCase = new CancelExpiredCheckoutSessionUseCase(
        payments as unknown as PaymentsRepository,
      );

      await expect(useCase.execute(event(), {})).resolves.toEqual({
        outcome: 'CANCELED',
        paymentId: PAYMENT_ID,
      });
      expect(payments.cancelPendingPayment).toHaveBeenCalledWith(
        {
          paymentId: PAYMENT_ID,
          providerCheckoutId: 'cs_expired',
          providerCustomerId: 'cus_test',
        },
        {},
      );
    },
  );

  it('correlates by Checkout ID when metadata paymentId is absent', async () => {
    const payments = repository();
    payments.findByProviderCheckoutId.mockResolvedValue(payment());
    payments.cancelPendingPayment.mockResolvedValue({ outcome: 'CANCELED' });
    const useCase = new CancelExpiredCheckoutSessionUseCase(
      payments as unknown as PaymentsRepository,
    );

    await useCase.execute(event({ paymentId: null }), {});

    expect(payments.findByProviderCheckoutId).toHaveBeenCalledWith(
      PaymentProvider.STRIPE,
      'cs_expired',
      {},
    );
  });

  it('keeps a succeeded payment unchanged for a late expired event', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ status: PaymentStatus.SUCCEEDED }));
    const useCase = new CancelExpiredCheckoutSessionUseCase(
      payments as unknown as PaymentsRepository,
    );

    await expect(useCase.execute(event(), {})).resolves.toEqual({ outcome: 'INVALID_TRANSITION' });
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it('handles duplicate expiration idempotently', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ status: PaymentStatus.CANCELED }));
    const useCase = new CancelExpiredCheckoutSessionUseCase(
      payments as unknown as PaymentsRepository,
    );

    await expect(useCase.execute(event(), {})).resolves.toEqual({
      outcome: 'ALREADY_CANCELED',
      paymentId: PAYMENT_ID,
    });
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it('rejects conflicting references before mutation', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ providerCheckoutId: 'cs_other' }));
    const useCase = new CancelExpiredCheckoutSessionUseCase(
      payments as unknown as PaymentsRepository,
    );

    await expect(useCase.execute(event(), {})).resolves.toEqual({ outcome: 'REFERENCE_CONFLICT' });
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it('does not derive Stripe mode from CheckoutPurpose', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({ checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION }),
    );
    payments.cancelPendingPayment.mockResolvedValue({ outcome: 'CANCELED' });
    const useCase = new CancelExpiredCheckoutSessionUseCase(
      payments as unknown as PaymentsRepository,
    );

    await expect(
      useCase.execute(event({ payload: { ...event().payload, mode: 'subscription' } }), {}),
    ).resolves.toEqual({ outcome: 'CANCELED', paymentId: PAYMENT_ID });
  });
});

function repository() {
  return {
    findById: vi.fn(),
    findByProviderCheckoutId: vi.fn(),
    cancelPendingPayment: vi.fn(),
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    providerType: PaymentProvider.STRIPE,
    status: PaymentStatus.PENDING,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    amount: 10_000,
    currency: 'USD',
    providerCheckoutId: 'cs_expired',
    providerCustomerId: 'cus_test',
    ...overrides,
  } as Payment;
}

function event(overrides: Partial<CheckoutSessionExpiredEvent> = {}): CheckoutSessionExpiredEvent {
  return {
    kind: PaymentEventKind.CHECKOUT_SESSION_EXPIRED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_expired',
    providerEventType: 'checkout.session.expired',
    providerCreatedAt: new Date('2026-10-14T12:00:00.000Z'),
    paymentId: PAYMENT_ID,
    payload: {
      id: 'cs_expired',
      customerId: 'cus_test',
      mode: 'payment',
      amount: 10_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_expired' },
    ...overrides,
  };
}

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
