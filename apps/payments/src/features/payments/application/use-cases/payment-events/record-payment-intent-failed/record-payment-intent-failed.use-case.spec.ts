import { describe, expect, it, vi } from 'vitest';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { type Payment, PaymentProvider, PaymentStatus } from '../../../../domain/payment.entity.js';
import type { PaymentIntentPaymentFailedEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { RecordPaymentIntentFailedUseCase } from './record-payment-intent-failed.use-case.js';

describe('RecordPaymentIntentFailedUseCase', () => {
  it.each([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED])(
    'correlates a %s Payment without mutating it',
    async (status) => {
      const payments = repository();
      const stored = payment({ status });
      payments.findById.mockResolvedValue(stored);
      const useCase = new RecordPaymentIntentFailedUseCase(payments as unknown as PaymentsRepository);

      await expect(useCase.execute(event(), {})).resolves.toEqual({
        outcome: 'CORRELATED',
        paymentId: stored.id,
      });
      expect(payments.findById).toHaveBeenCalledWith(stored.id, {});
    },
  );

  it('falls back to the saved PaymentIntent reference when metadata is absent', async () => {
    const payments = repository();
    payments.findByProviderPaymentId.mockResolvedValue(payment());
    const useCase = new RecordPaymentIntentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event({ paymentId: null }), {})).resolves.toMatchObject({
      outcome: 'CORRELATED',
    });
    expect(payments.findByProviderPaymentId).toHaveBeenCalledWith(PaymentProvider.STRIPE, 'pi_test', {});
  });

  it('keeps an event without available correlation as processed audit data', async () => {
    const payments = repository();
    payments.findByProviderPaymentId.mockResolvedValue(null);
    const useCase = new RecordPaymentIntentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event({ paymentId: null }), {})).resolves.toEqual({
      outcome: 'UNCORRELATED',
    });
  });

  it('does not correlate metadata to a conflicting PaymentIntent reference', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(payment({ providerPaymentId: 'pi_other' }));
    const useCase = new RecordPaymentIntentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual({ outcome: 'UNCORRELATED' });
  });
});

function repository() {
  return {
    findById: vi.fn(),
    findByProviderPaymentId: vi.fn(),
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    providerType: PaymentProvider.STRIPE,
    providerPaymentId: 'pi_test',
    status: PaymentStatus.PENDING,
    ...overrides,
  } as Payment;
}

function event(overrides: { paymentId?: string | null } = {}): PaymentIntentPaymentFailedEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_payment_failed',
    providerEventType: 'payment_intent.payment_failed',
    providerCreatedAt: FAILED_AT,
    paymentId:
      overrides.paymentId === undefined ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : overrides.paymentId,
    payload: {
      id: 'pi_test',
      providerCode: 'card_declined',
      declineCode: 'insufficient_funds',
      message: 'Your card was declined.',
      failedAt: FAILED_AT,
    },
  };
}

const FAILED_AT = new Date('2026-10-13T12:00:00.000Z');
