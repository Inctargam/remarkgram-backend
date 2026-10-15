import type * as DbosSdk from '@dbos-inc/dbos-sdk';

const dbosMock = vi.hoisted(() => ({
  workflowID: 'payment-webhook:STRIPE:evt_test',
  stepStatus: { currentAttempt: 1 },
  logger: { error: vi.fn() },
  workflow: vi.fn(
    () => (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  ),
  step: vi.fn(() => (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
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
import type { ApplyPaymentEventUseCase } from '../../application/use-cases/process-payment-webhook/apply-payment-event.use-case.js';
import type { CreateDeferredProviderSubscriptionUseCase } from '../../application/use-cases/process-payment-webhook/create-deferred-provider-subscription.use-case.js';
import type { LinkPaymentToSubscriptionUseCase } from '../../application/use-cases/process-payment-webhook/link-payment-to-subscription.use-case.js';
import type { ScheduleProviderSubscriptionCancellationUseCase } from '../../application/use-cases/process-payment-webhook/schedule-provider-subscription-cancellation.use-case.js';
import { Currency, PeriodUnit } from '../../../plans/domain/plan.entity.js';
import { PaymentEventKind } from '../../domain/payment-event-kind.js';
import { PaymentProvider, PaymentType } from '../../domain/payment.entity.js';
import { DbosPaymentWebhookWorkflow } from './dbos-payment-webhook.workflow.js';
import { PAYMENT_WEBHOOK_QUEUE } from './dbos-lifecycle.service.js';
import type { PaymentsDbosDataSource } from './payments-dbos.datasource.js';

describe('DbosPaymentWebhookWorkflow', () => {
  const dataSource = {
    client: {},
    runTransaction: vi.fn((callback: () => Promise<unknown>) => callback()),
  };
  const events = eventRepository();
  const applyPaymentEvent = {
    execute: vi.fn<ApplyPaymentEventUseCase['execute']>(),
  };
  const linkPaymentToSubscription = {
    execute: vi.fn<LinkPaymentToSubscriptionUseCase['execute']>(),
  };
  const scheduleProviderSubscriptionCancellation = {
    scheduleAtProvider: vi.fn<ScheduleProviderSubscriptionCancellationUseCase['scheduleAtProvider']>(),
    recordScheduled: vi.fn<ScheduleProviderSubscriptionCancellationUseCase['recordScheduled']>(),
  };
  const createDeferredProviderSubscription = {
    createAtProvider: vi.fn<CreateDeferredProviderSubscriptionUseCase['createAtProvider']>(),
    recordCreated: vi.fn<CreateDeferredProviderSubscriptionUseCase['recordCreated']>(),
  };
  const workflow = new DbosPaymentWebhookWorkflow(
    dataSource as unknown as PaymentsDbosDataSource,
    events,
    applyPaymentEvent as ApplyPaymentEventUseCase,
    linkPaymentToSubscription as LinkPaymentToSubscriptionUseCase,
    scheduleProviderSubscriptionCancellation as unknown as ScheduleProviderSubscriptionCancellationUseCase,
    createDeferredProviderSubscription as unknown as CreateDeferredProviderSubscriptionUseCase,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    dataSource.runTransaction.mockImplementation((callback: () => Promise<unknown>) => callback());
    events.saveIfAbsent.mockResolvedValue({ id: 'webhook-id' });
    events.recordAttempt.mockResolvedValue();
    events.markProcessed.mockResolvedValue();
    events.markRetrying.mockResolvedValue();
    events.markDead.mockResolvedValue();
    applyPaymentEvent.execute.mockResolvedValue({ outcome: 'FINISHED' });
    linkPaymentToSubscription.execute.mockResolvedValue({ outcome: 'FINISHED' });
    scheduleProviderSubscriptionCancellation.recordScheduled.mockResolvedValue();
    createDeferredProviderSubscription.createAtProvider.mockResolvedValue({
      providerSubscriptionId: 'sub_new',
    });
    createDeferredProviderSubscription.recordCreated.mockResolvedValue();
  });

  it('durably enqueues one workflow per provider event', async () => {
    await expect(workflow.enqueue(paymentEvent())).resolves.toBe('RECEIVED');

    expect(dbosMock.startWorkflow).toHaveBeenCalledWith(workflow, {
      workflowID: 'payment-webhook:STRIPE:evt_test',
      duplicationPolicy: 'return-existing',
      queueName: PAYMENT_WEBHOOK_QUEUE,
      enqueueOptions: { deduplicationID: 'payment-webhook:STRIPE:evt_test' },
    });
  });

  it('runs the first application step inside its own datasource transaction', async () => {
    const event = paymentEvent();

    await workflow.process(event);

    expect(events.recordAttempt).toHaveBeenCalledWith('webhook-id', 1, dataSource.client);
    expect(applyPaymentEvent.execute).toHaveBeenCalledWith(
      { eventId: 'webhook-id', event },
      dataSource.client,
    );
    expect(dataSource.runTransaction).toHaveBeenNthCalledWith(2, expect.any(Function), {
      name: 'recordPaymentWebhookAttempt',
    });
    expect(dataSource.runTransaction).toHaveBeenNthCalledWith(3, expect.any(Function), {
      name: 'applyPaymentWebhook',
    });
  });

  it('lets DBOS own retries when persisting the inbox event fails', async () => {
    events.saveIfAbsent.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(workflow.process(paymentEvent())).rejects.toThrow('database unavailable');

    expect(events.saveIfAbsent).toHaveBeenCalledTimes(1);
    expect(applyPaymentEvent.execute).not.toHaveBeenCalled();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('carries a successful payment across the step boundary before completing the webhook', async () => {
    applyPaymentEvent.execute.mockResolvedValue({
      outcome: 'SUCCESSFUL_PAYMENT',
      eventId: 'webhook-id',
      payment: {
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: 10,
        planId: 20,
        type: PaymentType.PURCHASE,
        autoRenewalRequested: true,
        targetSubscriptionId: null,
        amount: 1_000,
        currency: Currency.USD,
        periodCount: 1,
        periodUnit: PeriodUnit.MONTH,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: 'cus_test',
        paidAt: '2026-10-14T10:00:00.000Z',
      },
    });

    await workflow.process(paymentEvent());

    expect(linkPaymentToSubscription.execute).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'webhook-id' }),
      dataSource.client,
    );
    expect(dataSource.runTransaction).toHaveBeenNthCalledWith(4, expect.any(Function), {
      name: 'linkPaymentToSubscription',
    });
  });

  it('lets DBOS own retries when the application step fails', async () => {
    applyPaymentEvent.execute.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(workflow.process(paymentEvent())).rejects.toThrow('database unavailable');

    expect(applyPaymentEvent.execute).toHaveBeenCalledTimes(1);
    expect(events.recordAttempt).toHaveBeenCalledWith('webhook-id', 1, dataSource.client);
    expect(events.markRetrying).not.toHaveBeenCalled();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('для SCHEDULED регистрирует отдельный шаг отмены старой provider Subscription', async () => {
    const payment = successfulPayment();
    applyPaymentEvent.execute.mockResolvedValue({
      outcome: 'SUCCESSFUL_PAYMENT',
      eventId: 'webhook-id',
      payment,
    });
    const scheduled = {
      outcome: 'SCHEDULED' as const,
      eventId: 'webhook-id',
      payment,
      subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      nextSubscriptionStartsAt: '2026-11-14T10:00:00.000Z',
      previousProviderSubscriptionId: 'sub_previous',
    };
    linkPaymentToSubscription.execute.mockResolvedValue(scheduled);
    scheduleProviderSubscriptionCancellation.scheduleAtProvider.mockResolvedValue(scheduled);

    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();

    expect(scheduleProviderSubscriptionCancellation.scheduleAtProvider).toHaveBeenCalledWith(scheduled);
    expect(scheduleProviderSubscriptionCancellation.recordScheduled).toHaveBeenCalledWith(
      scheduled,
      dataSource.client,
    );
    expect(dataSource.runTransaction).toHaveBeenLastCalledWith(expect.any(Function), {
      name: 'recordDeferredProviderSubscription',
    });
    expect(createDeferredProviderSubscription.createAtProvider).toHaveBeenCalledWith(scheduled);
    expect(createDeferredProviderSubscription.recordCreated).toHaveBeenCalledWith(
      expect.objectContaining({ previousProviderSubscriptionId: 'sub_previous' }),
      { providerSubscriptionId: 'sub_new' },
      dataSource.client,
    );
  });
});

function successfulPayment() {
  return {
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: 10,
    planId: 20,
    type: PaymentType.PURCHASE,
    autoRenewalRequested: true,
    targetSubscriptionId: null,
    amount: 1_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    provider: PaymentProvider.STRIPE,
    providerCustomerId: 'cus_test',
    paidAt: '2026-10-14T10:00:00.000Z',
  };
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
