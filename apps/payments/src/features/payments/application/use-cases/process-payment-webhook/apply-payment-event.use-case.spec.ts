import type { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import type { ApplyCheckoutSessionCompletedUseCase } from '../payment-events/apply-checkout-session-completed/apply-checkout-session-completed.use-case.js';
import type { CancelExpiredCheckoutSessionUseCase } from '../payment-events/cancel-expired-checkout-session/cancel-expired-checkout-session.use-case.js';
import type { CancelPaymentIntentUseCase } from '../payment-events/cancel-payment-intent/cancel-payment-intent.use-case.js';
import type { ConfirmInvoicePaidUseCase } from '../payment-events/confirm-invoice-paid/confirm-invoice-paid.use-case.js';
import type { ConfirmPaymentIntentSucceededUseCase } from '../payment-events/confirm-payment-intent-succeeded/confirm-payment-intent-succeeded.use-case.js';
import type { RecordInvoicePaymentFailedUseCase } from '../payment-events/record-invoice-payment-failed/record-invoice-payment-failed.use-case.js';
import type { RecordPaymentIntentFailedUseCase } from '../payment-events/record-payment-intent-failed/record-payment-intent-failed.use-case.js';
import type { EnsureRenewalPaymentUseCase } from '../payment-events/ensure-renewal-payment/ensure-renewal-payment.use-case.js';
import type { CancelVoidedInvoiceUseCase } from '../payment-events/cancel-voided-invoice/cancel-voided-invoice.use-case.js';
import { ApplyPaymentEventUseCase } from './apply-payment-event.use-case.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import {
  CheckoutPurpose,
  type Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../domain/payment.entity.js';
import { Currency, PeriodUnit } from '../../../../plans/domain/plan.entity.js';
import type { PaymentEvent } from '../../events/payment-event.js';
import {
  PaymentEventCompletionCode,
  PaymentEventRejectionReason,
  paymentEventResult,
} from '../payment-events/payment-event-result.js';

describe('ApplyPaymentEventUseCase', () => {
  const events = eventRepository();
  const checkoutCompleted = { execute: vi.fn<ApplyCheckoutSessionCompletedUseCase['execute']>() };
  const checkoutExpired = { execute: vi.fn<CancelExpiredCheckoutSessionUseCase['execute']>() };
  const paymentSucceeded = { execute: vi.fn<ConfirmPaymentIntentSucceededUseCase['execute']>() };
  const invoicePaid = { execute: vi.fn<ConfirmInvoicePaidUseCase['execute']>() };
  const paymentFailed = { execute: vi.fn<RecordPaymentIntentFailedUseCase['execute']>() };
  const paymentCanceled = { execute: vi.fn<CancelPaymentIntentUseCase['execute']>() };
  const invoiceFailed = { execute: vi.fn<RecordInvoicePaymentFailedUseCase['execute']>() };
  const renewalEnsured = { execute: vi.fn<EnsureRenewalPaymentUseCase['execute']>() };
  const invoiceVoided = { execute: vi.fn<CancelVoidedInvoiceUseCase['execute']>() };
  const useCase = new ApplyPaymentEventUseCase(
    events,
    checkoutCompleted as ApplyCheckoutSessionCompletedUseCase,
    checkoutExpired as CancelExpiredCheckoutSessionUseCase,
    paymentSucceeded as ConfirmPaymentIntentSucceededUseCase,
    invoicePaid as ConfirmInvoicePaidUseCase,
    paymentFailed as RecordPaymentIntentFailedUseCase,
    paymentCanceled as CancelPaymentIntentUseCase,
    invoiceFailed as RecordInvoicePaymentFailedUseCase,
    renewalEnsured as EnsureRenewalPaymentUseCase,
    invoiceVoided as CancelVoidedInvoiceUseCase,
  );
  const ctx = {};

  beforeEach(() => {
    vi.clearAllMocks();
    events.recordAttempt.mockResolvedValue();
    events.attachPayment.mockResolvedValue();
    events.markProcessed.mockResolvedValue();
    events.markIgnored.mockResolvedValue();
    events.markDead.mockResolvedValue();
  });

  it('attaches a finalized renewal and finishes without applying a paid period', async () => {
    const event: PaymentEvent = {
      kind: PaymentEventKind.INVOICE_FINALIZED,
      provider: PaymentProvider.STRIPE,
      providerEventId: 'evt_finalized',
      providerEventType: 'invoice.finalized',
      providerCreatedAt: new Date(),
      paymentId: null,
      payload: {
        providerInvoiceId: 'in_cycle',
        providerSubscriptionId: 'sub_test',
        customerId: null,
        billingReason: 'subscription_cycle',
        amount: 100,
        currency: 'usd',
      },
    };
    renewalEnsured.execute.mockResolvedValue(
      paymentEventResult.completed(PaymentEventCompletionCode.RENEWAL_ENSURED, PAYMENT_ID),
    );
    const result = await useCase.execute({ eventId: 'webhook-id', event }, ctx);
    expect(result).toEqual(
      paymentEventResult.completed(PaymentEventCompletionCode.RENEWAL_ENSURED, PAYMENT_ID),
    );
    expect(renewalEnsured.execute).toHaveBeenCalledWith(event, ctx);
    expect(events.attachPayment).toHaveBeenCalledWith('webhook-id', PAYMENT_ID, ctx);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', ctx);
  });

  it('applies checkout completion and finishes the webhook', async () => {
    const event = checkoutCompletedEvent();
    checkoutCompleted.execute.mockResolvedValue(
      paymentEventResult.completed(PaymentEventCompletionCode.CHECKOUT_COMPLETED, PAYMENT_ID),
    );

    await expect(useCase.execute({ eventId: 'webhook-id', event }, ctx)).resolves.toEqual(
      paymentEventResult.completed(PaymentEventCompletionCode.CHECKOUT_COMPLETED, PAYMENT_ID),
    );

    expect(checkoutCompleted.execute).toHaveBeenCalledWith(event, ctx);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', ctx);
  });

  it('returns a successful Payment for the next durable step without completing the webhook', async () => {
    const event = paymentIntentSucceededEvent();
    paymentSucceeded.execute.mockResolvedValue(paymentEventResult.paymentConfirmed(successfulPayment()));

    await expect(useCase.execute({ eventId: 'webhook-id', event }, ctx)).resolves.toEqual(
      paymentEventResult.paymentConfirmed(successfulPayment()),
    );

    expect(paymentSucceeded.execute).toHaveBeenCalledWith(event, ctx);
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it('attaches a correlated failed attempt without changing Payment lifecycle', async () => {
    const event = paymentIntentFailedEvent();
    paymentFailed.execute.mockResolvedValue(
      paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_FAILURE_RECORDED, PAYMENT_ID),
    );

    await useCase.execute({ eventId: 'webhook-id', event }, ctx);

    expect(events.attachPayment).toHaveBeenCalledWith('webhook-id', PAYMENT_ID, ctx);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', ctx);
  });

  it('completes a canceled PaymentIntent and attaches its Payment atomically', async () => {
    const event = paymentIntentCanceledEvent();
    paymentCanceled.execute.mockResolvedValue(
      paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_CANCELED, PAYMENT_ID),
    );

    await useCase.execute({ eventId: 'webhook-id', event }, ctx);

    expect(events.attachPayment).toHaveBeenCalledWith('webhook-id', PAYMENT_ID, ctx);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', ctx);
  });

  it('completes a voided Invoice and attaches its renewal Payment atomically', async () => {
    const event: PaymentEvent = {
      kind: PaymentEventKind.INVOICE_VOIDED,
      provider: PaymentProvider.STRIPE,
      providerEventId: 'evt_voided',
      providerEventType: 'invoice.voided',
      providerCreatedAt: new Date('2026-10-26T12:00:00.000Z'),
      paymentId: null,
      payload: {
        providerInvoiceId: 'in_voided',
        providerSubscriptionId: 'sub_test',
        customerId: 'cus_test',
        billingReason: 'subscription_cycle',
      },
    };
    invoiceVoided.execute.mockResolvedValue(
      paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_CANCELED, PAYMENT_ID),
    );

    await useCase.execute({ eventId: 'webhook-id', event }, ctx);

    expect(invoiceVoided.execute).toHaveBeenCalledWith(event, ctx);
    expect(events.attachPayment).toHaveBeenCalledWith('webhook-id', PAYMENT_ID, ctx);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', ctx);
  });

  it('records an ignored rejection reason without processing the webhook or requesting D2', async () => {
    checkoutCompleted.execute.mockResolvedValue(
      paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND),
    );

    await expect(
      useCase.execute({ eventId: 'webhook-id', event: checkoutCompletedEvent() }, ctx),
    ).resolves.toEqual(paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND));

    expect(events.markIgnored).toHaveBeenCalledWith(
      'webhook-id',
      {
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment event processing result: PAYMENT_NOT_FOUND',
      },
      ctx,
    );
    expect(events.markProcessed).not.toHaveBeenCalled();
    expect(events.markDead).not.toHaveBeenCalled();
  });

  it('marks a reconciliation conflict as dead', async () => {
    checkoutCompleted.execute.mockResolvedValue(
      paymentEventResult.dead(PaymentEventRejectionReason.AMOUNT_MISMATCH),
    );

    await useCase.execute({ eventId: 'webhook-id', event: checkoutCompletedEvent() }, ctx);

    expect(events.markDead).toHaveBeenCalledWith(
      'webhook-id',
      {
        code: 'AMOUNT_MISMATCH',
        message: 'Payment event processing result: AMOUNT_MISMATCH',
      },
      ctx,
    );
  });
});

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function successfulPayment(): Payment {
  return {
    id: PAYMENT_ID,
    userId: 10,
    planId: 20,
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    autoRenewalRequested: true,
    amount: 1_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    providerCustomerId: 'cus_test',
    status: PaymentStatus.SUCCEEDED,
    paidAt: new Date('2026-10-14T10:00:00.000Z'),
  } as Payment;
}

function eventRepository() {
  return {
    saveIfAbsent: vi.fn<PaymentEventRepository['saveIfAbsent']>(),
    recordAttempt: vi.fn<PaymentEventRepository['recordAttempt']>(),
    attachPayment: vi.fn<PaymentEventRepository['attachPayment']>(),
    markProcessed: vi.fn<PaymentEventRepository['markProcessed']>(),
    markIgnored: vi.fn<PaymentEventRepository['markIgnored']>(),
    markRetrying: vi.fn<PaymentEventRepository['markRetrying']>(),
    markDead: vi.fn<PaymentEventRepository['markDead']>(),
    markReconciliationRequired: vi.fn<PaymentEventRepository['markReconciliationRequired']>(),
  } satisfies PaymentEventRepository;
}

function checkoutCompletedEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.CHECKOUT_SESSION_COMPLETED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_checkout',
    providerEventType: 'checkout.session.completed',
    providerCreatedAt: new Date('2026-10-14T10:00:00.000Z'),
    paymentId: PAYMENT_ID,
    payload: {
      id: 'cs_test',
      customerId: 'cus_test',
      mode: 'payment',
      paymentStatus: 'paid',
      providerPaymentId: 'pi_test',
      providerSubscriptionId: null,
      amount: 1_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_checkout' },
  };
}

function paymentIntentSucceededEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_SUCCEEDED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_success',
    providerEventType: 'payment_intent.succeeded',
    providerCreatedAt: new Date('2026-10-14T10:00:00.000Z'),
    paymentId: PAYMENT_ID,
    payload: {
      id: 'pi_test',
      customerId: 'cus_test',
      amount: 1_000,
      currency: 'usd',
      paidAt: new Date('2026-10-14T10:00:00.000Z'),
    },
  };
}

function paymentIntentFailedEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_failed',
    providerEventType: 'payment_intent.payment_failed',
    providerCreatedAt: new Date('2026-10-14T10:00:00.000Z'),
    paymentId: PAYMENT_ID,
    payload: {
      id: 'pi_test',
      providerCode: 'card_declined',
      declineCode: 'insufficient_funds',
      message: 'Declined',
      failedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
  };
}

function paymentIntentCanceledEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_CANCELED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_canceled',
    providerEventType: 'payment_intent.canceled',
    providerCreatedAt: new Date('2026-10-14T10:00:00.000Z'),
    paymentId: PAYMENT_ID,
    payload: {
      id: 'pi_test',
      customerId: 'cus_test',
      canceledAt: new Date('2026-10-14T10:00:00.000Z'),
    },
  };
}
