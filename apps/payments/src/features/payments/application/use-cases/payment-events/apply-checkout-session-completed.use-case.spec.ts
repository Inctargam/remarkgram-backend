import { describe, expect, it, vi } from 'vitest';
import { CheckoutPurpose, type Payment, PaymentProvider, PaymentStatus } from '../../../domain/payment.entity.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import type { CheckoutSessionCompletedEvent } from '../../events/payment-event.js';
import type { PaymentsRepository } from '../../ports/payments.repository.js';
import { ApplyCheckoutSessionCompletedUseCase } from './apply-checkout-session-completed.use-case.js';

describe('ApplyCheckoutSessionCompletedUseCase', () => {
  it.each(['paid', 'unpaid', 'no_payment_required'])(
    'applies completed with payment_status=%s without deriving financial success',
    async (paymentStatus) => {
      const payments = repository();
      payments.findById.mockResolvedValue(payment());
      payments.applyCheckoutCompleted.mockResolvedValue({ outcome: 'APPLIED' });
      const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);

      await expect(useCase.execute(event(paymentStatus), {})).resolves.toEqual({ outcome: 'APPLIED' });
      expect(payments.applyCheckoutCompleted).toHaveBeenCalledWith(
        {
          paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          providerCheckoutId: 'cs_test',
          providerCustomerId: 'cus_test',
          providerPaymentId: 'pi_test',
        },
        {},
      );
    },
  );

  it('allows compatible late reference enrichment without downgrading SUCCEEDED', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({ status: PaymentStatus.SUCCEEDED, providerPaymentId: 'pi_test' }),
    );
    payments.applyCheckoutCompleted.mockResolvedValue({ outcome: 'APPLIED' });
    const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event('paid'), {})).resolves.toEqual({ outcome: 'APPLIED' });
  });

  it('rejects conflicting references before repository mutation', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ providerCheckoutId: 'cs_other' }));
    const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event('paid'), {})).resolves.toEqual({ outcome: 'REFERENCE_CONFLICT' });
    expect(payments.applyCheckoutCompleted).not.toHaveBeenCalled();
  });

  it('does not validate subscription reference for a one-time extension checkout', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ providerSubscriptionId: 'sub_existing' }));
    payments.applyCheckoutCompleted.mockResolvedValue({ outcome: 'APPLIED' });
    const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);
    const extensionEvent: CheckoutSessionCompletedEvent = {
      ...event('paid'),
      payload: { ...event('paid').payload, providerSubscriptionId: 'sub_irrelevant' },
    };

    await expect(useCase.execute(extensionEvent, {})).resolves.toEqual({ outcome: 'APPLIED' });
    expect(payments.applyCheckoutCompleted).toHaveBeenCalledWith(
      expect.not.objectContaining({ providerSubscriptionId: expect.anything() }),
      {},
    );
  });

  it.each([PaymentStatus.CREATED, PaymentStatus.FAILED, PaymentStatus.CANCELED])(
    'enriches compatible references without changing local status %s',
    async (status) => {
      const payments = repository();
      payments.findById.mockResolvedValue(payment({ status }));
      payments.applyCheckoutCompleted.mockResolvedValue({ outcome: 'APPLIED' });
      const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);

      await expect(useCase.execute(event('paid'), {})).resolves.toEqual({ outcome: 'APPLIED' });
      expect(payments.applyCheckoutCompleted).toHaveBeenCalledOnce();
    },
  );

  it('treats matching references on CREATED as already applied', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({
        status: PaymentStatus.CREATED,
        providerCheckoutId: 'cs_test',
        providerPaymentId: 'pi_test',
      }),
    );
    const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event('paid'), {})).resolves.toEqual({ outcome: 'ALREADY_APPLIED' });
    expect(payments.applyCheckoutCompleted).not.toHaveBeenCalled();
  });

  it('treats an already applied event as an idempotent no-op', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({
        status: PaymentStatus.PENDING,
        providerCheckoutId: 'cs_test',
        providerPaymentId: 'pi_test',
      }),
    );
    const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event('paid'), {})).resolves.toEqual({ outcome: 'ALREADY_APPLIED' });
    expect(payments.applyCheckoutCompleted).not.toHaveBeenCalled();
  });

  it('persists only the subscription reference for an initial subscription checkout', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({ checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION }),
    );
    payments.applyCheckoutCompleted.mockResolvedValue({ outcome: 'APPLIED' });
    const useCase = new ApplyCheckoutSessionCompletedUseCase(payments as unknown as PaymentsRepository);
    const initialEvent: CheckoutSessionCompletedEvent = {
      ...event('paid'),
      payload: {
        ...event('paid').payload,
        mode: 'subscription',
        providerPaymentId: null,
        providerSubscriptionId: 'sub_test',
      },
    };

    await expect(useCase.execute(initialEvent, {})).resolves.toEqual({ outcome: 'APPLIED' });
    expect(payments.applyCheckoutCompleted).toHaveBeenCalledWith(
      {
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        providerCheckoutId: 'cs_test',
        providerCustomerId: 'cus_test',
        providerSubscriptionId: 'sub_test',
      },
      {},
    );
  });
});

function repository() {
  return {
    findById: vi.fn(),
    applyCheckoutCompleted: vi.fn(),
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    providerType: PaymentProvider.STRIPE,
    status: PaymentStatus.PENDING,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    amount: 10_000,
    currency: 'USD',
    providerCheckoutId: null,
    providerPaymentId: null,
    providerSubscriptionId: null,
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
    ...overrides,
  } as Payment;
}

function event(paymentStatus: string): CheckoutSessionCompletedEvent {
  return {
    kind: PaymentEventKind.CHECKOUT_SESSION_COMPLETED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_checkout',
    providerEventType: 'checkout.session.completed',
    providerCreatedAt: new Date('2026-10-12T12:00:00.000Z'),
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload: {
      id: 'cs_test',
      customerId: 'cus_test',
      mode: 'payment',
      paymentStatus,
      providerPaymentId: 'pi_test',
      providerSubscriptionId: null,
      amount: 10_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_checkout' },
  };
}
