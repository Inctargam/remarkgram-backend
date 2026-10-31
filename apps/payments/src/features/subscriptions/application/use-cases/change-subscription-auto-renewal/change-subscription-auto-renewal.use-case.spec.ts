import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentProvider } from '../../../../payments/domain/payment-provider.factory.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionStatus } from '../../../domain/enums/subscription-status.enum.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type { AutoRenewalOperation, SubscriptionForPayment } from '../../types/subscriptions.types.js';
import type { SubscriptionAutoRenewalOperationParams } from '../../types/subscription-auto-renewal.types.js';
import {
  EnableSubscriptionAutoRenewalCommand,
  EnableSubscriptionAutoRenewalUseCase,
} from '../enable-subscription-auto-renewal/enable-subscription-auto-renewal.use-case.js';
import {
  DisableSubscriptionAutoRenewalCommand,
  DisableSubscriptionAutoRenewalUseCase,
} from '../disable-subscription-auto-renewal/disable-subscription-auto-renewal.use-case.js';
import {
  PrepareSubscriptionAutoRenewalChangeCommand,
  PrepareSubscriptionAutoRenewalChangeUseCase,
} from '../prepare-subscription-auto-renewal-change/prepare-subscription-auto-renewal-change.use-case.js';
import {
  ConfirmSubscriptionAutoRenewalChangeCommand,
  ConfirmSubscriptionAutoRenewalChangeUseCase,
} from '../confirm-subscription-auto-renewal-change/confirm-subscription-auto-renewal-change.use-case.js';

const subscriptionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idempotencyKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Manual auto-renewal entry commands', () => {
  it.each([true, false])('starts the shared workflow for enabled=%s', async (enabled) => {
    const result = { operationId: 'operation', subscriptionId, autoRenewalEnabled: enabled };
    const workflow = { execute: vi.fn().mockResolvedValue(result) };
    const params = { userId: 42, subscriptionId: subscriptionId.toUpperCase(), idempotencyKey: idempotencyKey.toUpperCase() };
    const pending = enabled
      ? new EnableSubscriptionAutoRenewalUseCase(workflow).execute(new EnableSubscriptionAutoRenewalCommand(params))
      : new DisableSubscriptionAutoRenewalUseCase(workflow).execute(new DisableSubscriptionAutoRenewalCommand(params));
    await expect(pending).resolves.toEqual(result);
    expect(workflow.execute).toHaveBeenCalledExactlyOnceWith({
      workflowId: `subscription-auto-renewal:42:${idempotencyKey}`,
      userId: 42,
      subscriptionId,
      autoRenewalEnabled: enabled,
    });
  });

  it.each([
    { userId: 0 }, { userId: 1.5 }, { subscriptionId: 'invalid' }, { idempotencyKey: 'invalid' },
  ])('rejects invalid arguments before starting the workflow: %j', (invalid) => {
    const workflow = { execute: vi.fn() };
    const command = new EnableSubscriptionAutoRenewalCommand({ userId: 42, subscriptionId, idempotencyKey, ...invalid });
    expect(() => new EnableSubscriptionAutoRenewalUseCase(workflow).execute(command)).toThrow();
    expect(workflow.execute).not.toHaveBeenCalled();
  });
});

describe('PrepareSubscriptionAutoRenewalChangeUseCase', () => {
  afterEach(() => vi.useRealTimers());

  it.each([true, false])('records intent and a transition for enabled=%s', async (enabled) => {
    const { repository, params, subscription, prepare, tx } = fixture();
    params.autoRenewalEnabled = enabled;
    subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.DISABLED : AutoRenewalStatus.ENABLED;
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).resolves.toMatchObject({
      ...params, providerSubscriptionId: 'sub_current', completed: false,
    });
    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, tx);
    expect(repository.createAutoRenewalOperation).toHaveBeenCalledExactlyOnceWith({
      operation: {
        id: params.operationId, userId: 42, subscriptionId,
        type: enabled ? AutoRenewalOperationType.ENABLE : AutoRenewalOperationType.DISABLE,
        status: AutoRenewalOperationStatus.PENDING,
        provider: PaymentProvider.STRIPE, providerSubscriptionId: 'sub_current',
        paymentId: null, sourceSubscriptionId: null, sourceProviderSubscriptionId: null,
      },
      autoRenewalStatus: enabled ? AutoRenewalStatus.ENABLING : AutoRenewalStatus.DISABLING,
    }, tx);
  });

  it.each([true, false])('records an already satisfied enabled=%s request without a transition', async (enabled) => {
    const { repository, params, subscription, prepare, tx } = fixture();
    params.autoRenewalEnabled = enabled;
    subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.ENABLED : AutoRenewalStatus.DISABLED;
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).resolves.toMatchObject({ completed: true });
    expect(repository.createAutoRenewalOperation).toHaveBeenCalledWith({
      operation: expect.objectContaining({ status: AutoRenewalOperationStatus.COMPLETED }),
      autoRenewalStatus: null,
    }, tx);
  });

  it.each([AutoRenewalOperationStatus.PENDING, AutoRenewalOperationStatus.COMPLETED])(
    'replays %s before looking at current subscription state', async (status) => {
      const { repository, params, prepare, tx, operation } = fixture();
      operation.status = status;
      repository.findAutoRenewalOperation.mockResolvedValue(operation);
      await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).resolves.toMatchObject({
        autoRenewalEnabled: true, completed: status === AutoRenewalOperationStatus.COMPLETED,
      });
      expect(repository.findByUserId).not.toHaveBeenCalled();
      expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
    },
  );

  it('does not read before the shared user lock has been acquired', async () => {
    const { repository, params, prepare, tx, operation } = fixture();
    let release!: () => void;
    repository.lockByUserId.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const pending = prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx));
    expect(repository.findAutoRenewalOperation).not.toHaveBeenCalled();
    operation.status = AutoRenewalOperationStatus.COMPLETED;
    repository.findAutoRenewalOperation.mockResolvedValue(operation);
    release();
    await pending;
    expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it('rejects an absent or foreign subscription without exposing its owner', async () => {
    const { repository, params, prepare, tx } = fixture();
    repository.findByUserId.mockResolvedValue([]);
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toMatchObject({ reason: 'SUBSCRIPTION_NOT_FOUND' });
    expect(repository.findByUserId).toHaveBeenCalledWith(42, tx);
    expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it.each([AutoRenewalStatus.ENABLING, AutoRenewalStatus.DISABLING])('rejects another unfinished %s change', async (status) => {
    const { repository, subscription, params, prepare, tx } = fixture();
    repository.findByUserId.mockResolvedValue([subscription, { ...subscription, subscriptionId: 'other', autoRenewalStatus: status }]);
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toMatchObject({ reason: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS' });
    expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it.each([
    [AutoRenewalStatus.RETIRED, 'sub_current', 'SUBSCRIPTION_RETIRED'],
    [AutoRenewalStatus.DISABLED, null, 'PROVIDER_SUBSCRIPTION_MISSING'],
  ] as const)('rejects ineligible binding %s/%s', async (status, providerId, reason) => {
    const { subscription, params, prepare, tx } = fixture();
    subscription.autoRenewalStatus = status;
    subscription.providerSubscriptionId = providerId;
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toMatchObject({ reason });
  });

  it('rejects a subscription followed by a paid future period', async () => {
    const { repository, subscription, params, prepare, tx } = fixture();
    repository.findByUserId.mockResolvedValue([subscription, { ...subscription, subscriptionId: 'later', expiresAt: new Date('2030-03-01') }]);
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toMatchObject({ reason: 'SUBSCRIPTION_NOT_LAST' });
  });

  it('allows the bound future period to be managed before it starts', async () => {
    const { subscription, params, prepare, tx } = fixture();
    subscription.status = SubscriptionStatus.PENDING;
    subscription.startsAt = new Date('2030-01-15');
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).resolves.toMatchObject({ completed: false });
  });

  it.each([true, false])('handles expired access with enabled=%s', async (enabled) => {
    const { subscription, params, prepare, tx } = fixture();
    params.autoRenewalEnabled = enabled;
    subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.DISABLED : AutoRenewalStatus.ENABLED;
    subscription.expiresAt = new Date();
    const pending = prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx));
    if (enabled) await expect(pending).rejects.toMatchObject({ reason: 'SUBSCRIPTION_EXPIRED' });
    else await expect(pending).resolves.toMatchObject({ completed: false });
  });

  it('propagates a preparation write failure', async () => {
    const { repository, params, prepare, tx } = fixture();
    const error = new Error('write failed');
    repository.createAutoRenewalOperation.mockRejectedValue(error);
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toBe(error);
  });
});

describe('ConfirmSubscriptionAutoRenewalChangeUseCase', () => {
  afterEach(() => vi.useRealTimers());

  it.each([true, false])('confirms enabled=%s in the supplied transaction', async (enabled) => {
    const { repository, params, confirm, tx, operation } = fixture();
    params.autoRenewalEnabled = enabled;
    operation.type = enabled ? AutoRenewalOperationType.ENABLE : AutoRenewalOperationType.DISABLE;
    repository.findAutoRenewalOperation.mockResolvedValue(operation);
    await expect(confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx))).resolves.toEqual({
      operationId: params.operationId, subscriptionId, autoRenewalEnabled: enabled,
    });
    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, tx);
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledExactlyOnceWith({
      operationId: params.operationId,
      autoRenewalStatus: enabled ? AutoRenewalStatus.ENABLED : AutoRenewalStatus.DISABLED,
    }, tx);
  });

  it('does not undo a later opposite change on a completed replay', async () => {
    const { repository, params, confirm, tx, operation, subscription } = fixture();
    operation.status = AutoRenewalOperationStatus.COMPLETED;
    subscription.autoRenewalStatus = AutoRenewalStatus.DISABLED;
    repository.findAutoRenewalOperation.mockResolvedValue(operation);
    await expect(confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx))).resolves.toMatchObject({ autoRenewalEnabled: true });
    expect(repository.completeAutoRenewalOperation).not.toHaveBeenCalled();
    expect(repository.findByUserId).not.toHaveBeenCalled();
  });

  it('rejects a missing operation', async () => {
    const { params, confirm, tx } = fixture();
    await expect(confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toMatchObject({ reason: 'OPERATION_NOT_FOUND' });
  });

  it.each([
    { userId: 99 }, { subscriptionId: 'other' }, { type: AutoRenewalOperationType.DISABLE },
    { type: AutoRenewalOperationType.TRANSFER }, { status: AutoRenewalOperationStatus.BINDING_PENDING },
    { providerSubscriptionId: null },
  ])('rejects conflicting operation identities in both local steps: %j', async (change) => {
    const { repository, params, prepare, confirm, tx, operation } = fixture();
    repository.findAutoRenewalOperation.mockResolvedValue({ ...operation, ...change });
    await expect(prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toMatchObject({ reason: 'OPERATION_MISMATCH' });
    await expect(confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toMatchObject({ reason: 'OPERATION_MISMATCH' });
    expect(repository.completeAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it('propagates a confirmation write failure', async () => {
    const { repository, params, confirm, tx, operation } = fixture();
    repository.findAutoRenewalOperation.mockResolvedValue(operation);
    const error = new Error('write failed');
    repository.completeAutoRenewalOperation.mockRejectedValue(error);
    await expect(confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx))).rejects.toBe(error);
  });
});

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
  const params: SubscriptionAutoRenewalOperationParams = {
    operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', userId: 42, subscriptionId, autoRenewalEnabled: true,
  };
  const subscription: SubscriptionForPayment = {
    subscriptionId, planId: 1, provider: PaymentProvider.STRIPE, providerSubscriptionId: 'sub_current',
    startsAt: new Date('2029-12-01'), expiresAt: new Date('2030-02-01'),
    status: SubscriptionStatus.ACTIVE, autoRenewalStatus: AutoRenewalStatus.DISABLED,
  };
  const operation: AutoRenewalOperation = {
    id: params.operationId, userId: 42, subscriptionId, type: AutoRenewalOperationType.ENABLE,
    status: AutoRenewalOperationStatus.PENDING, provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_current', paymentId: null, sourceSubscriptionId: null, sourceProviderSubscriptionId: null,
  };
  const repository = {
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    findByUserId: vi.fn<SubscriptionsRepository['findByUserId']>().mockResolvedValue([subscription]),
    findAutoRenewalOperation: vi.fn<SubscriptionsRepository['findAutoRenewalOperation']>().mockResolvedValue(null),
    createAutoRenewalOperation: vi.fn<SubscriptionsRepository['createAutoRenewalOperation']>().mockResolvedValue(),
    completeAutoRenewalOperation: vi.fn<SubscriptionsRepository['completeAutoRenewalOperation']>().mockResolvedValue(),
    findPaymentApplication: vi.fn<SubscriptionsRepository['findPaymentApplication']>(),
    confirmAutoRenewalCancellation: vi.fn<SubscriptionsRepository['confirmAutoRenewalCancellation']>(),
    bindProviderSubscription: vi.fn<SubscriptionsRepository['bindProviderSubscription']>(),
    markExpired: vi.fn<SubscriptionsRepository['markExpired']>(),
    setAutoRenewalState: vi.fn<SubscriptionsRepository['setAutoRenewalState']>(),
    renewWithPaymentApplication: vi.fn<SubscriptionsRepository['renewWithPaymentApplication']>(),
    createWithPaymentApplication: vi.fn<SubscriptionsRepository['createWithPaymentApplication']>(),
  };
  return {
    repository, params, subscription, operation, tx: {},
    prepare: new PrepareSubscriptionAutoRenewalChangeUseCase(repository),
    confirm: new ConfirmSubscriptionAutoRenewalChangeUseCase(repository),
  };
}
