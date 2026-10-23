import { RenewalPaymentContextUnavailableError } from '../../application/errors/renewal-payment-context-unavailable.error.js';
import { PaymentWorkflowAttemptError } from './payment-workflow-attempt.error.js';
import { classifyPaymentWorkflowError } from './payment-workflow-error.policy.js';
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
import { PaymentProviderResultMismatchError } from '../../application/errors/payment-provider.error.js';
import { PaymentWebhookEnqueueUnavailableError } from '../../../../common/application/errors/payments.error.js';
import type { PaymentEventRepository } from '../../application/ports/payment-event.repository.js';
import type { ApplyPaymentEventUseCase } from '../../application/use-cases/process-payment-webhook/apply-payment-event.use-case.js';
import type { CreateDeferredProviderSubscriptionUseCase } from '../../application/use-cases/process-payment-webhook/create-deferred-provider-subscription.use-case.js';
import type { LinkPaymentToSubscriptionUseCase } from '../../application/use-cases/process-payment-webhook/link-payment-to-subscription.use-case.js';
import type { ScheduleProviderSubscriptionCancellationUseCase } from '../../application/use-cases/process-payment-webhook/schedule-provider-subscription-cancellation.use-case.js';
import {
  PaymentEventResultCode,
  PaymentEventResultStatus,
  paymentEventResult,
} from '../../application/use-cases/payment-events/payment-event-result.js';
import { Currency, PeriodUnit } from '../../../plans/domain/plan.entity.js';
import { PaymentEventKind } from '../../domain/payment-event-kind.js';
import { PaymentProvider, PaymentType } from '../../domain/payment.entity.js';
import { DbosPaymentWebhookWorkflow } from './dbos-payment-webhook.workflow.js';
import { MissingDbosWorkflowContextError } from './dbos-payment-webhook.errors.js';
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
    dbosMock.workflowID = 'payment-webhook:STRIPE:evt_test';
    dataSource.runTransaction.mockImplementation((callback: () => Promise<unknown>) => callback());
    events.saveIfAbsent.mockResolvedValue({ id: 'webhook-id' });
    events.recordAttempt.mockResolvedValue();
    events.markProcessed.mockResolvedValue();
    events.markRetrying.mockResolvedValue();
    events.markDead.mockResolvedValue();
    events.markReconciliationRequired.mockResolvedValue();
    applyPaymentEvent.execute.mockResolvedValue(
      paymentEventResult.success(PaymentEventResultCode.CHECKOUT_COMPLETED, null),
    );
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

  it('translates a DBOS enqueue failure at the infrastructure boundary', async () => {
    dbosMock.startWorkflow.mockImplementationOnce(() => ({
      process: vi.fn().mockRejectedValue(new Error('DBOS unavailable')),
    }));

    await expect(workflow.enqueue(paymentEvent())).rejects.toBeInstanceOf(
      PaymentWebhookEnqueueUnavailableError,
    );
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

  it('rejects invocation outside a DBOS workflow context with an infrastructure error', async () => {
    dbosMock.workflowID = undefined;

    await expect(workflow.process(paymentEvent())).rejects.toBeInstanceOf(MissingDbosWorkflowContextError);
    expect(events.saveIfAbsent).not.toHaveBeenCalled();
  });

  it('retries inbox persistence with a durable delay before applying the event', async () => {
    events.saveIfAbsent.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(events.saveIfAbsent).toHaveBeenCalledTimes(2);
    expect(applyPaymentEvent.execute).toHaveBeenCalledOnce();
    expect(dbosMock.sleepSeconds).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('carries a successful payment across the step boundary before completing the webhook', async () => {
    applyPaymentEvent.execute.mockResolvedValue({
      status: PaymentEventResultStatus.SUCCESS,
      code: PaymentEventResultCode.PAYMENT_SUCCEEDED,
      paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

  it('retries a failed application in a separate transaction after a durable delay', async () => {
    applyPaymentEvent.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(applyPaymentEvent.execute).toHaveBeenCalledTimes(2);
    expect(events.recordAttempt.mock.calls.map(([, attempt]) => attempt)).toEqual([1, 2]);
    expect(events.markRetrying).toHaveBeenCalledWith('webhook-id', {
      code: 'UNEXPECTED_WORKFLOW_ERROR', message: 'Payment webhook processing failed unexpectedly',
    }, dataSource.client);
    expect(dbosMock.sleepSeconds).toHaveBeenCalledExactlyOnceWith(10);
    expect(events.markDead).not.toHaveBeenCalled();
  });

  it('schedules the durable delay outside the failed transaction', async () => {
    let insideTransaction = false;
    dataSource.runTransaction.mockImplementation(async (callback) => {
      insideTransaction = true;
      try { return await callback(); } finally { insideTransaction = false; }
    });
    applyPaymentEvent.execute.mockRejectedValueOnce(new Error('database unavailable'));
    dbosMock.sleepSeconds.mockImplementationOnce(() => {
      expect(insideTransaction).toBe(false);
    });
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(applyPaymentEvent.execute).toHaveBeenCalledTimes(2);
  });

  it.each(['SOURCE_PAYMENT_NOT_FOUND', 'SOURCE_NOT_LINKED'] as const)('retries temporary renewal context failure %s', async (reason) => {
    applyPaymentEvent.execute.mockRejectedValueOnce(new RenewalPaymentContextUnavailableError('in_test', reason));
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(applyPaymentEvent.execute).toHaveBeenCalledTimes(2);
    expect(events.markRetrying).toHaveBeenCalledWith('webhook-id', expect.objectContaining({ code: `RENEWAL_${reason}` }), dataSource.client);
    expect(dbosMock.sleepSeconds).toHaveBeenCalledExactlyOnceWith(10);
    expect(events.markReconciliationRequired).not.toHaveBeenCalled();
  });

  it.each(['SOURCE_METADATA_MISSING', 'PAYMENT_DISAPPEARED'] as const)('requires reconciliation without retry for %s', async (reason) => {
    applyPaymentEvent.execute.mockRejectedValueOnce(new RenewalPaymentContextUnavailableError('in_test', reason));
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(applyPaymentEvent.execute).toHaveBeenCalledOnce();
    expect(events.markReconciliationRequired).toHaveBeenCalledWith('webhook-id', {
      code: `RENEWAL_${reason}`, message: `Renewal payment context: ${reason}`,
    }, dataSource.client);
    expect(events.markDead).not.toHaveBeenCalled();
    expect(events.markRetrying).not.toHaveBeenCalled();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
    expect(linkPaymentToSubscription.execute).not.toHaveBeenCalled();
  });

  it('stops after ten failed attempts and records reconciliation with the last failure code', async () => {
    const error = new RenewalPaymentContextUnavailableError('in_test', 'SOURCE_NOT_LINKED');
    // Use one-shot failures so other tests retain the default successful implementation.
    for (let index = 0; index < 10; index += 1) applyPaymentEvent.execute.mockRejectedValueOnce(error);
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(applyPaymentEvent.execute).toHaveBeenCalledTimes(10);
    expect(dbosMock.sleepSeconds.mock.calls.map(([seconds]) => seconds)).toEqual([10, 20, 40, 80, 160, 320, 640, 1280, 2560]);
    expect(events.markRetrying).toHaveBeenCalledTimes(9);
    expect(events.markReconciliationRequired).toHaveBeenCalledWith('webhook-id', {
      code: 'PAYMENT_APPLICATION_RETRIES_EXHAUSTED',
      message: 'applyPaymentWebhook: exhausted 10 attempts; last failure: RENEWAL_SOURCE_NOT_LINKED',
    }, dataSource.client);
    expect(events.markDead).not.toHaveBeenCalled();
  });

  it('still schedules retry when the database also rejects the retry audit update', async () => {
    applyPaymentEvent.execute.mockRejectedValueOnce(new Error('database unavailable'));
    events.markRetrying.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(dbosMock.sleepSeconds).toHaveBeenCalledExactlyOnceWith(10);
    expect(applyPaymentEvent.execute).toHaveBeenCalledTimes(2);
  });

  it('preserves reconciliation classification when a transaction error is replayed as a plain Error', async () => {
    const original = new PaymentWorkflowAttemptError(classifyPaymentWorkflowError(
      new RenewalPaymentContextUnavailableError('in_test', 'SOURCE_METADATA_MISSING'),
    ));
    const replayed = new Error(original.message);
    replayed.name = original.name;
    dataSource.runTransaction.mockImplementationOnce((callback) => callback())
      .mockImplementationOnce((callback) => callback())
      .mockRejectedValueOnce(replayed);
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(events.markReconciliationRequired).toHaveBeenCalledWith('webhook-id',
      expect.objectContaining({ code: 'RENEWAL_SOURCE_METADATA_MISSING' }), dataSource.client);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('keeps V6 application history available without introducing new durable calls', async () => {
    applyPaymentEvent.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.processV6(paymentEvent())).rejects.toThrow('database unavailable');
    expect(applyPaymentEvent.execute).toHaveBeenCalledOnce();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('retries Subscription application without repeating financial reconciliation', async () => {
    const payment = successfulPayment();
    applyPaymentEvent.execute.mockResolvedValue({
      status: PaymentEventResultStatus.SUCCESS, code: PaymentEventResultCode.PAYMENT_SUCCEEDED,
      paymentId: payment.paymentId, payment,
    });
    linkPaymentToSubscription.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();
    expect(applyPaymentEvent.execute).toHaveBeenCalledOnce();
    expect(linkPaymentToSubscription.execute).toHaveBeenCalledTimes(2);
    expect(dbosMock.sleepSeconds).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('marks a permanent application failure dead without asking DBOS to retry it', async () => {
    applyPaymentEvent.execute.mockRejectedValueOnce(
      new PaymentProviderResultMismatchError('apply payment event'),
    );

    await expect(workflow.process(paymentEvent())).resolves.toBeUndefined();

    expect(events.markDead).toHaveBeenCalledWith(
      'webhook-id',
      expect.objectContaining({ code: 'PAYMENT_PROVIDER_RESULT_MISMATCH' }),
      dataSource.client,
    );
    expect(events.markRetrying).not.toHaveBeenCalled();
  });

  it('retries local binding for SCHEDULED without repeating successful provider steps', async () => {
    const payment = successfulPayment();
    applyPaymentEvent.execute.mockResolvedValue({
      status: PaymentEventResultStatus.SUCCESS,
      code: PaymentEventResultCode.PAYMENT_SUCCEEDED,
      paymentId: payment.paymentId,
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
    createDeferredProviderSubscription.recordCreated.mockRejectedValueOnce(new Error('database unavailable'));

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
    expect(createDeferredProviderSubscription.createAtProvider).toHaveBeenCalledOnce();
    expect(scheduleProviderSubscriptionCancellation.scheduleAtProvider).toHaveBeenCalledOnce();
    expect(createDeferredProviderSubscription.recordCreated).toHaveBeenCalledTimes(2);
    expect(dbosMock.sleepSeconds).toHaveBeenCalledExactlyOnceWith(10);
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
    markReconciliationRequired: vi.fn<PaymentEventRepository['markReconciliationRequired']>(),
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
