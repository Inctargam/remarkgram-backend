import type * as DbosSdk from '@dbos-inc/dbos-sdk';

const dbosMock = vi.hoisted(() => ({
  workflowID: 'payment-webhook:STRIPE:evt_test',
  logger: { error: vi.fn() },
  workflow: vi.fn(
    () => (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  ),
  startWorkflow: vi.fn(() => ({ process: vi.fn().mockResolvedValue({}) })),
  sleepSeconds: vi.fn(),
}));

vi.mock('@dbos-inc/dbos-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof DbosSdk>()),
  ConfiguredInstance: class ConfiguredInstance {},
  DBOS: dbosMock,
}));

import type { PaymentEvent } from '../../application/events/payment-event.js';
import type { PaymentEventRepository } from '../../application/ports/payment-event.repository.js';
import type { ConfirmPaymentIntentSucceededUseCase } from '../../application/use-cases/payment-events/confirm-payment-intent-succeeded.use-case.js';
import type { ConfirmInvoicePaidUseCase } from '../../application/use-cases/payment-events/confirm-invoice-paid.use-case.js';
import type { ApplyCheckoutSessionCompletedUseCase } from '../../application/use-cases/payment-events/apply-checkout-session-completed.use-case.js';
import type { CancelExpiredCheckoutSessionUseCase } from '../../application/use-cases/payment-events/cancel-expired-checkout-session/cancel-expired-checkout-session.use-case.js';
import type { RecordPaymentIntentFailedUseCase } from '../../application/use-cases/payment-events/record-payment-intent-failed.use-case.js';
import type { RecordInvoicePaymentFailedUseCase } from '../../application/use-cases/payment-events/record-invoice-payment-failed.use-case.js';
import { PaymentEventKind } from '../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../domain/payment.entity.js';
import { DbosPaymentWebhookWorkflow } from './dbos-payment-webhook.workflow.js';
import { PAYMENT_WEBHOOK_QUEUE } from './dbos-lifecycle.service.js';
import type { PaymentsDbosDataSource } from './payments-dbos.datasource.js';

describe('DbosPaymentWebhookWorkflow', () => {
  const dataSource = {
    client: {},
    runTransaction: vi.fn((callback: () => Promise<unknown>) => callback()),
  };
  const events = eventRepository();
  const applyCheckoutSessionCompleted = {
    execute: vi.fn<ApplyCheckoutSessionCompletedUseCase['execute']>(),
  };
  const confirmPaymentIntentSucceeded = {
    execute: vi.fn<ConfirmPaymentIntentSucceededUseCase['execute']>(),
  };
  const cancelExpiredCheckoutSession = {
    execute: vi.fn<CancelExpiredCheckoutSessionUseCase['execute']>(),
  };
  const confirmInvoicePaid = {
    execute: vi.fn<ConfirmInvoicePaidUseCase['execute']>(),
  };
  const recordPaymentIntentFailed = {
    execute: vi.fn<RecordPaymentIntentFailedUseCase['execute']>(),
  };
  const recordInvoicePaymentFailed = {
    execute: vi.fn<RecordInvoicePaymentFailedUseCase['execute']>(),
  };
  const workflow = new DbosPaymentWebhookWorkflow(
    dataSource as unknown as PaymentsDbosDataSource,
    events,
    applyCheckoutSessionCompleted as ApplyCheckoutSessionCompletedUseCase,
    cancelExpiredCheckoutSession as CancelExpiredCheckoutSessionUseCase,
    confirmPaymentIntentSucceeded as ConfirmPaymentIntentSucceededUseCase,
    confirmInvoicePaid as ConfirmInvoicePaidUseCase,
    recordPaymentIntentFailed as RecordPaymentIntentFailedUseCase,
    recordInvoicePaymentFailed as RecordInvoicePaymentFailedUseCase,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    dataSource.runTransaction.mockImplementation((callback: () => Promise<unknown>) => callback());
    events.saveIfAbsent.mockResolvedValue({ id: 'webhook-id' });
    events.recordAttempt.mockResolvedValue();
    events.attachPayment.mockResolvedValue();
    events.markProcessed.mockResolvedValue();
    events.markIgnored.mockResolvedValue();
    events.markRetrying.mockResolvedValue();
    events.markDead.mockResolvedValue();
    applyCheckoutSessionCompleted.execute.mockReset();
    cancelExpiredCheckoutSession.execute.mockReset();
    confirmPaymentIntentSucceeded.execute.mockReset();
    confirmInvoicePaid.execute.mockReset();
    recordPaymentIntentFailed.execute.mockReset();
    recordInvoicePaymentFailed.execute.mockReset();
  });

  it('durably enqueues one workflow per provider event', async () => {
    const event = paymentEvent();

    await expect(workflow.enqueue(event)).resolves.toBe('RECEIVED');

    expect(dbosMock.startWorkflow).toHaveBeenCalledWith(workflow, {
      workflowID: 'payment-webhook:STRIPE:evt_test',
      duplicationPolicy: 'return-existing',
      queueName: PAYMENT_WEBHOOK_QUEUE,
      enqueueOptions: {
        deduplicationID: 'payment-webhook:STRIPE:evt_test',
      },
    });
  });

  it('commits the Payment change and webhook completion in one datasource transaction', async () => {
    applyCheckoutSessionCompleted.execute.mockResolvedValue({ outcome: 'APPLIED' });

    await workflow.process(paymentEvent());

    expect(events.saveIfAbsent).toHaveBeenCalledWith(
      paymentEvent(),
      'payment-webhook:STRIPE:evt_test',
      dataSource.client,
    );
    expect(applyCheckoutSessionCompleted.execute).toHaveBeenCalledWith(paymentEvent(), dataSource.client);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', dataSource.client);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('ignores a webhook when its previously created local Payment no longer exists', async () => {
    applyCheckoutSessionCompleted.execute.mockResolvedValue({ outcome: 'PAYMENT_NOT_FOUND' });

    await workflow.process(paymentEvent());

    expect(events.markIgnored).toHaveBeenCalledWith(
      'webhook-id',
      {
        code: 'PAYMENT_NOT_FOUND',
        message: 'Webhook refers to a local payment that no longer exists',
      },
      dataSource.client,
    );
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
    expect(applyCheckoutSessionCompleted.execute).toHaveBeenCalledTimes(1);
  });

  it('records a non-retryable correlation failure as DEAD', async () => {
    applyCheckoutSessionCompleted.execute.mockResolvedValue({ outcome: 'AMOUNT_MISMATCH' });

    await workflow.process(paymentEvent());

    expect(events.markDead).toHaveBeenCalledWith(
      'webhook-id',
      {
        code: 'AMOUNT_MISMATCH',
        message: 'Checkout completion rejected: AMOUNT_MISMATCH',
      },
      dataSource.client,
    );
  });

  it('confirms payment_intent.succeeded and completes its webhook in the same transaction', async () => {
    const event = paymentIntentSucceededEvent();
    confirmPaymentIntentSucceeded.execute.mockResolvedValue({ outcome: 'SUCCEEDED' });

    await workflow.process(event);

    expect(confirmPaymentIntentSucceeded.execute).toHaveBeenCalledWith(event, dataSource.client);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', dataSource.client);
    expect(events.markIgnored).not.toHaveBeenCalled();
    expect(events.markDead).not.toHaveBeenCalled();
  });

  it('cancels a payment when its Checkout Session expires', async () => {
    const event = checkoutSessionExpiredEvent();
    cancelExpiredCheckoutSession.execute.mockResolvedValue({
      outcome: 'CANCELED',
      paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    await workflow.process(event);

    expect(cancelExpiredCheckoutSession.execute).toHaveBeenCalledWith(event, dataSource.client);
    expect(events.attachPayment).toHaveBeenCalledWith(
      'webhook-id',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      dataSource.client,
    );
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', dataSource.client);
  });

  it('confirms invoice.paid and completes its webhook in the same transaction', async () => {
    const event = invoicePaidEvent();
    confirmInvoicePaid.execute.mockResolvedValue({ outcome: 'SUCCEEDED' });

    await workflow.process(event);

    expect(confirmInvoicePaid.execute).toHaveBeenCalledWith(event, dataSource.client);
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', dataSource.client);
    expect(events.markDead).not.toHaveBeenCalled();
  });

  it('records payment_intent.payment_failed without changing Payment lifecycle', async () => {
    const event = paymentIntentFailedEvent();
    recordPaymentIntentFailed.execute.mockResolvedValue({
      outcome: 'CORRELATED',
      paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    await workflow.process(event);

    expect(events.attachPayment).toHaveBeenCalledWith(
      'webhook-id',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      dataSource.client,
    );
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', dataSource.client);
  });

  it('processes an uncorrelated payment failure as audit data', async () => {
    const event = paymentIntentFailedEvent();
    recordPaymentIntentFailed.execute.mockResolvedValue({ outcome: 'UNCORRELATED' });

    await workflow.process(event);

    expect(events.attachPayment).not.toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', dataSource.client);
    expect(events.markDead).not.toHaveBeenCalled();
  });

  it('records invoice.payment_failed without creating or changing a Payment', async () => {
    const event = invoicePaymentFailedEvent();
    recordInvoicePaymentFailed.execute.mockResolvedValue({ outcome: 'UNCORRELATED' });

    await workflow.process(event);

    expect(recordInvoicePaymentFailed.execute).toHaveBeenCalledWith(event, dataSource.client);
    expect(events.attachPayment).not.toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalledWith('webhook-id', dataSource.client);
    expect(events.markDead).not.toHaveBeenCalled();
  });
});

function eventRepository() {
  return {
    saveIfAbsent: vi.fn<PaymentEventRepository['saveIfAbsent']>(),
    recordAttempt: vi.fn<PaymentEventRepository['recordAttempt']>(),
    attachPayment: vi.fn<PaymentEventRepository['attachPayment']>(),
    markProcessed: vi.fn<PaymentEventRepository['markProcessed']>(),
    markIgnored: vi.fn<PaymentEventRepository['markIgnored']>(),
    markRetrying: vi.fn<PaymentEventRepository['markRetrying']>(),
    markDead: vi.fn<PaymentEventRepository['markDead']>(),
  } satisfies PaymentEventRepository;
}

function paymentEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.CHECKOUT_SESSION_COMPLETED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_test',
    providerEventType: 'checkout.session.completed',
    providerCreatedAt: new Date('2026-10-12T12:00:00.000Z'),
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload: {
      id: 'cs_test',
      customerId: 'cus_test',
      mode: 'subscription',
      paymentStatus: 'paid',
      providerPaymentId: null,
      providerSubscriptionId: 'sub_test',
      amount: 1_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_test' },
  };
}

function paymentIntentSucceededEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_SUCCEEDED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_pi_succeeded',
    providerEventType: 'payment_intent.succeeded',
    providerCreatedAt: new Date('2026-10-12T12:00:00.000Z'),
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload: {
      id: 'pi_test',
      customerId: 'cus_test',
      amount: 10_000,
      currency: 'usd',
      paidAt: new Date('2026-10-12T12:00:00.000Z'),
    },
  };
}

function checkoutSessionExpiredEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.CHECKOUT_SESSION_EXPIRED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_expired',
    providerEventType: 'checkout.session.expired',
    providerCreatedAt: new Date('2026-10-14T12:00:00.000Z'),
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload: {
      id: 'cs_expired',
      customerId: 'cus_test',
      mode: 'payment',
      amount: 10_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_expired' },
  };
}

function invoicePaidEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.INVOICE_PAID,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_invoice_paid',
    providerEventType: 'invoice.paid',
    providerCreatedAt: new Date('2026-10-12T12:00:00.000Z'),
    paymentId: null,
    payload: {
      id: 'in_test',
      customerId: 'cus_test',
      amount: 10_000,
      currency: 'usd',
      paidAt: new Date('2026-10-12T12:00:00.000Z'),
      providerPaymentId: 'pi_invoice',
      providerSubscriptionId: 'sub_test',
      providerInvoiceId: 'in_test',
      billingReason: 'subscription_cycle',
    },
  };
}

function paymentIntentFailedEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_payment_failed',
    providerEventType: 'payment_intent.payment_failed',
    providerCreatedAt: new Date('2026-10-12T12:00:00.000Z'),
    paymentId: null,
    payload: {
      id: 'pi_test',
      providerCode: 'card_declined',
      declineCode: 'insufficient_funds',
      message: 'Your card was declined.',
      failedAt: new Date('2026-10-12T12:00:00.000Z'),
    },
  };
}

function invoicePaymentFailedEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.INVOICE_PAYMENT_FAILED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_invoice_failed',
    providerEventType: 'invoice.payment_failed',
    providerCreatedAt: new Date('2026-10-13T12:00:00.000Z'),
    paymentId: null,
    payload: {
      id: 'in_failed',
      customerId: 'cus_test',
      billingReason: 'subscription_cycle',
      providerPaymentId: 'pi_failed',
      providerSubscriptionId: 'sub_test',
      providerInvoiceId: 'in_failed',
      providerCode: 'card_declined',
      declineCode: 'insufficient_funds',
      message: 'Your card was declined.',
      failedAt: new Date('2026-10-13T12:00:00.000Z'),
    },
  };
}
