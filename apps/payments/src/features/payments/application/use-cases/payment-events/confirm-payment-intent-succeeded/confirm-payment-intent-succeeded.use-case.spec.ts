import { PaymentPersistenceError } from '../../../../../../common/application/errors/payments.error.js';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentIntentSucceededEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import {
  CheckoutPurpose,
  type Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../../domain/payment.entity.js';
import { ConfirmPaymentIntentSucceededUseCase } from './confirm-payment-intent-succeeded.use-case.js';
import { PaymentEventResultCode, paymentEventResult } from '../payment-event-result.js';

describe('ConfirmPaymentIntentSucceededUseCase', () => {
  it('correlates by metadata paymentId and confirms a matching extension', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate());
    const confirmed = confirmedPayment();
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'SUCCEEDED', payment: confirmed });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.successfulPayment(confirmed),
    );
    expect(payments.findById).toHaveBeenCalledWith(event().paymentId, {});
    expect(payments.findByProviderPaymentId).not.toHaveBeenCalled();
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledWith(
      {
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        paidAt: new Date('2026-10-12T12:00:00.000Z'),
        providerPaymentId: 'pi_test',
        providerCustomerId: 'cus_test',
      },
      {},
    );
  });

  it('falls back to the saved provider PaymentIntent when metadata is absent', async () => {
    const payments = repository();
    payments.findByProviderPaymentId.mockResolvedValue(candidate());
    const confirmed = confirmedPayment();
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'SUCCEEDED', payment: confirmed });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event({ paymentId: null }), {})).resolves.toEqual(
      paymentEventResult.successfulPayment(confirmed),
    );
    expect(payments.findByProviderPaymentId).toHaveBeenCalledWith(PaymentProvider.STRIPE, 'pi_test', {});
  });

  it('allows success before checkout completion for a metadata-correlated CREATED payment', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      candidate({ status: PaymentStatus.CREATED, providerPaymentId: null }),
    );
    const confirmed = confirmedPayment();
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'SUCCEEDED', payment: confirmed });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.successfulPayment(confirmed),
    );
  });

  it('accepts concurrent success with the persisted paidAt without another read or write', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate());
    const confirmed = confirmedPayment({ paidAt: new Date('2026-10-12T11:00:00.000Z') });
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED', payment: confirmed });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.successfulPayment(confirmed));
    expect(payments.findById).toHaveBeenCalledOnce();
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
  });

  it.each([
    [null, paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_NOT_FOUND)],
    [confirmedPayment({ providerPaymentId: 'pi_other' }), paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT)],
    [confirmedPayment({ providerCustomerId: 'cus_other' }), paymentEventResult.dead(PaymentEventResultCode.CUSTOMER_MISMATCH)],
    [confirmedPayment({ amount: 999 }), paymentEventResult.dead(PaymentEventResultCode.AMOUNT_MISMATCH)],
    [candidate({ status: PaymentStatus.CANCELED }), paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE)],
    [candidate({ status: PaymentStatus.FAILED }), paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE)],
  ])('classifies the reread Payment after an unsuccessful update: %j', async (payment, expected) => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate());
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED', payment });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(expected);
    expect(payments.findById).toHaveBeenCalledOnce();
  });

  it.each([PaymentStatus.CREATED, PaymentStatus.PENDING])('throws a retryable error for an unexplained unchanged %s Payment', async (status) => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate());
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED', payment: candidate({ status }) });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).rejects.toBeInstanceOf(PaymentPersistenceError);
  });

  it('rejects a concurrent success without paidAt', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate());
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED', payment: confirmedPayment({ paidAt: null }) });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);
    await expect(useCase.execute(event(), {})).rejects.toThrow();
  });

  it('rejects PaymentIntent success for an initial purchase before repository mutation', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate({ checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION }));
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventResultCode.PURPOSE_MISMATCH),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('returns SUCCEEDED without overwriting paidAt on replay', async () => {
    const payments = repository();
    const confirmed = confirmedPayment({ paidAt: new Date('2026-10-12T11:00:00.000Z') });
    payments.findById.mockResolvedValue(confirmed);
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.successfulPayment(confirmed),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('rejects amount mismatch before repository mutation', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate({ amount: 20_000 }));
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventResultCode.AMOUNT_MISMATCH),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('rejects a conflicting PaymentIntent reference before repository mutation', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(candidate({ providerPaymentId: 'pi_other' }));
    const useCase = new ConfirmPaymentIntentSucceededUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });
});

function repository() {
  return {
    findById: vi.fn(),
    findByProviderPaymentId: vi.fn(),
    confirmSuccessfulPayment: vi.fn(),
  };
}

function candidate(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    providerType: PaymentProvider.STRIPE,
    status: PaymentStatus.PENDING,
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    amount: 10_000,
    currency: 'USD',
    paidAt: null,
    providerPaymentId: 'pi_test',
    providerSubscriptionId: null,
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
    ...overrides,
  } as Payment;
}

function confirmedPayment(overrides: Partial<Payment> = {}): Payment {
  return candidate({
    status: PaymentStatus.SUCCEEDED,
    paidAt: new Date('2026-10-12T12:00:00.000Z'),
    ...overrides,
  });
}

function event(overrides: { paymentId?: string | null } = {}): PaymentIntentSucceededEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_SUCCEEDED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_success',
    providerEventType: 'payment_intent.succeeded',
    providerCreatedAt: new Date('2026-10-12T12:00:00.000Z'),
    paymentId:
      overrides.paymentId === undefined ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : overrides.paymentId,
    payload: {
      id: 'pi_test',
      customerId: 'cus_test',
      amount: 10_000,
      currency: 'usd',
      paidAt: new Date('2026-10-12T12:00:00.000Z'),
    },
  };
}
