import type * as DbosSdk from '@dbos-inc/dbos-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentProvider } from '../../../payments/domain/payment-provider.factory.js';
import type { PaymentsDbosDataSource } from '../../../payments/infrastructure/dbos/payments-dbos.datasource.js';
import { AutoRenewalOperationType } from '../../domain/enums/auto-renewal-operation-type.enum.js';
import { AutoRenewalOperationStatus } from '../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';
import type { SubscriptionsRepository } from '../../application/ports/subscriptions.repository.js';
import type { SubscriptionForPayment } from '../../application/types/subscriptions.types.js';
import type { SubscriptionAutoRenewalOperationParams } from '../../application/types/subscription-auto-renewal.types.js';
import { DbosChangeSubscriptionAutoRenewalWorkflow } from './dbos-change-subscription-auto-renewal.workflow.js';

vi.mock('@dbos-inc/dbos-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof DbosSdk>()),
  ConfiguredInstance: class ConfiguredInstance {},
}));

const subscriptionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Auto-renewal workflow preparation', () => {
  afterEach(() => vi.useRealTimers());

  it.each([true, false])('records intent and a transition for enabled=%s', async (enabled) => {
    const { repository, params, subscription, workflow, tx } = fixture();
    params.autoRenewalEnabled = enabled;
    subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.DISABLED : AutoRenewalStatus.ENABLED;
    await expect(workflow['prepare'](params)).resolves.toMatchObject({
      ...params, providerSubscriptionId: 'sub_current', completed: false,
    });
    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, tx);
    expect(repository.createAutoRenewalOperation).toHaveBeenCalledExactlyOnceWith({
      operation: {
        id: params.operationId, userId: 42, subscriptionId,
        type: enabled ? AutoRenewalOperationType.ENABLE : AutoRenewalOperationType.DISABLE,
        status: enabled ? AutoRenewalOperationStatus.ENABLE_PENDING : AutoRenewalOperationStatus.DISABLE_PENDING,
        provider: PaymentProvider.STRIPE, providerSubscriptionId: 'sub_current',
        paymentId: null, sourceSubscriptionId: null, sourceProviderSubscriptionId: null,
      },
      autoRenewalStatus: enabled ? AutoRenewalStatus.ENABLING : AutoRenewalStatus.DISABLING,
    }, tx);
  });

  it.each([true, false])('returns an already satisfied enabled=%s request without writing', async (enabled) => {
    const { repository, params, subscription, workflow } = fixture();
    params.autoRenewalEnabled = enabled;
    subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.ENABLED : AutoRenewalStatus.DISABLED;
    await expect(workflow['prepare'](params)).resolves.toMatchObject({ completed: true });
    expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it('waits for the shared user lock before reading subscriptions', async () => {
    const { repository, params, workflow } = fixture();
    let release!: () => void;
    repository.lockByUserId.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));

    const pending = workflow['prepare'](params);
    expect(repository.findByUserId).not.toHaveBeenCalled();
    expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();

    release();
    await pending;
    expect(repository.createAutoRenewalOperation).toHaveBeenCalledTimes(1);
  });

  it('rejects an absent or foreign subscription without exposing its owner', async () => {
    const { repository, params, workflow, tx } = fixture();
    repository.findByUserId.mockResolvedValue([]);
    await expect(workflow['prepare'](params)).rejects.toMatchObject({ reason: 'SUBSCRIPTION_NOT_FOUND' });
    expect(repository.findByUserId).toHaveBeenCalledWith(42, tx);
    expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it.each([AutoRenewalStatus.ENABLING, AutoRenewalStatus.DISABLING])('rejects another unfinished %s change', async (status) => {
    const { repository, subscription, params, workflow } = fixture();
    repository.findByUserId.mockResolvedValue([subscription, { ...subscription, subscriptionId: 'other', autoRenewalStatus: status }]);
    await expect(workflow['prepare'](params)).rejects.toMatchObject({ reason: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS' });
    expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it.each([
    [AutoRenewalStatus.RETIRED, 'sub_current', 'SUBSCRIPTION_RETIRED'],
    [AutoRenewalStatus.DISABLED, null, 'PROVIDER_SUBSCRIPTION_MISSING'],
  ] as const)('rejects ineligible binding %s/%s', async (status, providerId, reason) => {
    const { subscription, params, workflow } = fixture();
    subscription.autoRenewalStatus = status;
    subscription.providerSubscriptionId = providerId;
    await expect(workflow['prepare'](params)).rejects.toMatchObject({ reason });
  });

  it('rejects a subscription followed by a paid future period', async () => {
    const { repository, subscription, params, workflow } = fixture();
    repository.findByUserId.mockResolvedValue([subscription, { ...subscription, subscriptionId: 'later', expiresAt: new Date('2030-03-01') }]);
    await expect(workflow['prepare'](params)).rejects.toMatchObject({ reason: 'SUBSCRIPTION_NOT_LAST' });
  });

  it('allows the bound future period to be managed before it starts', async () => {
    const { subscription, params, workflow } = fixture();
    subscription.status = SubscriptionStatus.PENDING;
    subscription.startsAt = new Date('2030-01-15');
    await expect(workflow['prepare'](params)).resolves.toMatchObject({ completed: false });
  });

  it.each([true, false])('handles expired access with enabled=%s', async (enabled) => {
    const { subscription, params, workflow } = fixture();
    params.autoRenewalEnabled = enabled;
    subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.DISABLED : AutoRenewalStatus.ENABLED;
    subscription.expiresAt = new Date();
    const pending = workflow['prepare'](params);
    if (enabled) await expect(pending).rejects.toMatchObject({ reason: 'SUBSCRIPTION_EXPIRED' });
    else await expect(pending).resolves.toMatchObject({ completed: false });
  });

  it('propagates a preparation write failure', async () => {
    const { repository, params, workflow } = fixture();
    const error = new Error('write failed');
    repository.createAutoRenewalOperation.mockRejectedValue(error);
    await expect(workflow['prepare'](params)).rejects.toBe(error);
  });
});

describe('Auto-renewal workflow confirmation', () => {
  afterEach(() => vi.useRealTimers());

  it.each([true, false])('confirms enabled=%s in the supplied transaction', async (enabled) => {
    const { repository, params, workflow, tx } = fixture();
    params.autoRenewalEnabled = enabled;
    await expect(workflow['confirm'](params)).resolves.toEqual({
      operationId: params.operationId, subscriptionId, autoRenewalEnabled: enabled,
    });
    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, tx);
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledExactlyOnceWith({
      operationId: params.operationId,
      autoRenewalStatus: enabled ? AutoRenewalStatus.ENABLED : AutoRenewalStatus.DISABLED,
    }, tx);
  });

  it('waits for the shared user lock before confirming the operation', async () => {
    const { repository, params, workflow } = fixture();
    let release!: () => void;
    repository.lockByUserId.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));

    const pending = workflow['confirm'](params);
    expect(repository.completeAutoRenewalOperation).not.toHaveBeenCalled();

    release();
    await pending;
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledTimes(1);
  });

  it('propagates a confirmation write failure', async () => {
    const { repository, params, workflow } = fixture();
    const error = new Error('write failed');
    repository.completeAutoRenewalOperation.mockRejectedValue(error);
    await expect(workflow['confirm'](params)).rejects.toBe(error);
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
  const repository = {
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    findByUserId: vi.fn<SubscriptionsRepository['findByUserId']>().mockResolvedValue([subscription]),
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
  const tx = {};
  const dataSource = {
    client: tx,
    runTransaction: async <T>(action: () => Promise<T>) => action(),
  };
  const gateway = { enable: vi.fn(), disable: vi.fn() };
  const workflow = new DbosChangeSubscriptionAutoRenewalWorkflow(
    dataSource as unknown as PaymentsDbosDataSource,
    gateway,
    repository,
  );
  return { repository, params, subscription, tx, workflow };
}
