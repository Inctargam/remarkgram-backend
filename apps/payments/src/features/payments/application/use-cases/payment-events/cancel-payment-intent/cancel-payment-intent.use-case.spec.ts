import { describe, expect, it, vi } from 'vitest';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import type { PaymentIntentCanceledEvent } from '../../../events/payment-event.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import {
  CheckoutPurpose,
  type Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../../domain/payment.entity.js';
import { CancelPaymentIntentUseCase } from './cancel-payment-intent.use-case.js';
import { PaymentEventResultCode, paymentEventResult } from '../payment-event-result.js';

describe('CancelPaymentIntentUseCase', () => {
  it.each([PaymentStatus.CREATED, PaymentStatus.PENDING])(
    'cancels an eligible one-time payment in %s',
    async (status) => {
      const payments = repository();
      payments.findById.mockResolvedValue(payment({ status }));
      payments.cancelPendingPayment.mockResolvedValue({ outcome: 'CANCELED' });
      const useCase = new CancelPaymentIntentUseCase(payments as unknown as PaymentsRepository);

      await expect(useCase.execute(event(), {})).resolves.toEqual(CANCELED);
      expect(payments.cancelPendingPayment).toHaveBeenCalledWith(
        {
          paymentId: PAYMENT_ID,
          providerPaymentId: 'pi_canceled',
          providerCustomerId: 'cus_test',
        },
        {},
      );
    },
  );

  it('correlates by PaymentIntent ID when metadata is absent', async () => {
    const payments = repository();
    payments.findByProviderPaymentId.mockResolvedValue(payment());
    payments.cancelPendingPayment.mockResolvedValue({ outcome: 'CANCELED' });
    const useCase = new CancelPaymentIntentUseCase(payments as unknown as PaymentsRepository);

    await useCase.execute(event({ paymentId: null }), {});

    expect(payments.findByProviderPaymentId).toHaveBeenCalledWith(
      PaymentProvider.STRIPE,
      'pi_canceled',
      {},
    );
  });

  it('does not downgrade a succeeded payment', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ status: PaymentStatus.SUCCEEDED }));
    const useCase = new CancelPaymentIntentUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE),
    );
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it('does not cancel an initial subscription purchase', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({ checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION }),
    );
    const useCase = new CancelPaymentIntentUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.ignored(PaymentEventResultCode.INELIGIBLE_PAYMENT),
    );
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it('handles duplicate cancellation idempotently', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ status: PaymentStatus.CANCELED }));
    const useCase = new CancelPaymentIntentUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(CANCELED);
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it('rejects a conflicting PaymentIntent reference before mutation', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ providerPaymentId: 'pi_other' }));
    const useCase = new CancelPaymentIntentUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT),
    );
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });
});

function repository() {
  return {
    findById: vi.fn(),
    findByProviderPaymentId: vi.fn(),
    cancelPendingPayment: vi.fn(),
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    providerType: PaymentProvider.STRIPE,
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    status: PaymentStatus.PENDING,
    providerPaymentId: 'pi_canceled',
    providerCustomerId: 'cus_test',
    ...overrides,
  } as Payment;
}

function event(overrides: Partial<PaymentIntentCanceledEvent> = {}): PaymentIntentCanceledEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_CANCELED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_canceled',
    providerEventType: 'payment_intent.canceled',
    providerCreatedAt: CANCELED_AT,
    paymentId: PAYMENT_ID,
    payload: { id: 'pi_canceled', customerId: 'cus_test', canceledAt: CANCELED_AT },
    ...overrides,
  };
}

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANCELED_AT = new Date('2026-10-17T12:00:00.000Z');
const CANCELED = paymentEventResult.success(PaymentEventResultCode.PAYMENT_CANCELED, PAYMENT_ID);
