import type * as DbosSdk from '@dbos-inc/dbos-sdk';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const durable = vi.hoisted(() => ({
  steps: new Map<string, unknown>(),
  transactions: new Map<string, unknown>(),
  transactionErrors: new Map<string, unknown>(),
  inTransaction: false,
}));
const dbosMock = vi.hoisted(() => ({
  workflowID: 'auto-renewal-workflow',
  randomUUID: vi.fn<() => Promise<string>>(),
  startWorkflow: vi.fn(),
  sleepSeconds: vi.fn<(seconds: number) => Promise<void>>().mockResolvedValue(undefined),
  workflow: vi.fn(() => (_target: object, _key: string, descriptor: PropertyDescriptor) => descriptor),
  step: vi.fn(
    (options: {
      name: string;
      retriesAllowed: boolean;
      maxAttempts: number;
      intervalSeconds: number;
      backoffRate: number;
      shouldRetry(error: unknown): boolean;
    }) =>
      (_target: object, _key: string, descriptor: PropertyDescriptor) => {
        const original = descriptor.value as (args: unknown) => Promise<unknown>;
        // A small durable checkpoint double: successful external steps survive workflow replay.
        descriptor.value = async function (this: object, args: unknown) {
          const key = options.name + JSON.stringify(args);
          if (durable.steps.has(key)) return durable.steps.get(key);
          for (let attempt = 1; ; attempt += 1) {
            try {
              const result = await original.call(this, args);
              durable.steps.set(key, result);
              return result;
            } catch (error) {
              if (!options.shouldRetry(error) || attempt === options.maxAttempts) throw error;
            }
          }
        };
        return descriptor;
      },
  ),
}));

vi.mock('@dbos-inc/dbos-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof DbosSdk>()),
  ConfiguredInstance: class ConfiguredInstance {},
  DBOS: dbosMock,
}));

import { PaymentProvider } from '../../../payments/domain/payment-provider.factory.js';
import {
  PaymentProviderOutcomeUnknownError,
  PaymentProviderUnavailableError,
  PaymentProviderValidationError,
  PaymentProviderResultMismatchError,
} from '../../../payments/application/errors/payment-provider.error.js';
import type { PaymentsDbosDataSource } from '../../../payments/infrastructure/dbos/payments-dbos.datasource.js';
import {
  SubscriptionAutoRenewalConflictError,
  SubscriptionAutoRenewalFailedError,
  SubscriptionAutoRenewalIdempotencyConflictError,
} from '../../application/errors/subscription-auto-renewal.errors.js';
import type { SubscriptionsRepository } from '../../application/ports/subscriptions.repository.js';
import type { SubscriptionForPayment } from '../../application/types/subscriptions.types.js';
import { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';
import { DbosChangeSubscriptionAutoRenewalWorkflow } from './dbos-change-subscription-auto-renewal.workflow.js';

const input = { userId: 42, subscriptionId: 'subscription', autoRenewalEnabled: true };
const operationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const workflowParams = { ...input, workflowId: 'subscription-auto-renewal:42:key' };

beforeEach(() => {
  vi.clearAllMocks();
  durable.steps.clear();
  durable.transactions.clear();
  durable.transactionErrors.clear();
  durable.inTransaction = false;
  dbosMock.randomUUID.mockResolvedValue(operationId);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('DbosChangeSubscriptionAutoRenewalWorkflow', () => {
  it.each([true, false])(
    'calls D1 outside a transaction with the stable operation ID, enabled=%s',
    async (enabled) => {
      const { workflow, dataSource, gateway, repository, result, tx } = fixture(enabled);
      await expect(workflow.changeAutoRenewal({ ...input, autoRenewalEnabled: enabled })).resolves.toEqual(
        result,
      );
      expect(dbosMock.randomUUID).toHaveBeenCalledTimes(1);
      expect(repository.findByUserId).toHaveBeenCalledWith(input.userId, tx);
      expect(repository.completeAutoRenewalOperation).toHaveBeenCalledWith(
        expect.objectContaining({ operationId }), tx,
      );
      expect(dataSource.runTransaction).toHaveBeenCalledTimes(2);
      expect(dataSource.runTransaction.mock.calls.map(([, options]) => options.name)).toEqual([
        'prepareSubscriptionAutoRenewalChange',
        'confirmSubscriptionAutoRenewalChange',
      ]);
      expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
      expect(enabled ? gateway.enable : gateway.disable).toHaveBeenCalledExactlyOnceWith({
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: 'sub_current',
        autoRenewalChangeId: operationId,
      });
      expect(enabled ? gateway.disable : gateway.enable).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'skips the provider and confirmation when enabled=%s is already set',
    async (enabled) => {
      const { workflow, gateway, repository, subscription, result } = fixture(enabled);
      subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.ENABLED : AutoRenewalStatus.DISABLED;

      await expect(workflow.changeAutoRenewal({ ...input, autoRenewalEnabled: enabled })).resolves.toEqual(result);
      expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
      expect(gateway.enable).not.toHaveBeenCalled();
      expect(gateway.disable).not.toHaveBeenCalled();
      expect(repository.completeAutoRenewalOperation).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'replays an already satisfied enabled=%s request after a later change without writing',
    async (enabled) => {
      const { workflow, gateway, repository, subscription, result } = fixture(enabled);
      const request = { ...input, autoRenewalEnabled: enabled };
      subscription.autoRenewalStatus = enabled ? AutoRenewalStatus.ENABLED : AutoRenewalStatus.DISABLED;
      await expect(workflow.changeAutoRenewal(request)).resolves.toEqual(result);

      // A later request changed the subscription; replay must retain the original no-op result.
      const laterStatus = enabled ? AutoRenewalStatus.DISABLED : AutoRenewalStatus.ENABLED;
      subscription.autoRenewalStatus = laterStatus;
      repository.findByUserId.mockRejectedValue(new Error('completed preparation must not run again'));

      await expect(workflow.changeAutoRenewal(request)).resolves.toEqual(result);
      expect(subscription.autoRenewalStatus).toBe(laterStatus);
      expect(repository.findByUserId).toHaveBeenCalledTimes(1);
      expect(repository.createAutoRenewalOperation).not.toHaveBeenCalled();
      expect(repository.completeAutoRenewalOperation).not.toHaveBeenCalled();
      expect(gateway.enable).not.toHaveBeenCalled();
      expect(gateway.disable).not.toHaveBeenCalled();
    },
  );

  it('fails once when local confirmation fails after a successful provider step', async () => {
    const { workflow, dataSource, gateway, repository } = fixture();
    repository.completeAutoRenewalOperation.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.changeAutoRenewal(input)).rejects.toThrow('database unavailable');
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(dataSource.runTransaction).toHaveBeenCalledTimes(2);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('reuses the provider checkpoint after interruption before the confirmation transaction', async () => {
    const { workflow, dataSource, gateway, repository, result } = fixture();
    const runTransaction = dataSource.runTransaction.getMockImplementation()!;
    // The process stops before the second transaction begins, so no error checkpoint exists for it.
    dataSource.runTransaction
      .mockImplementationOnce(runTransaction)
      .mockRejectedValueOnce(new Error('process interrupted'));
    await expect(workflow.changeAutoRenewal(input)).rejects.toThrow('process interrupted');

    await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
    expect(repository.createAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(gateway.enable).toHaveBeenCalledExactlyOnceWith({
      provider: PaymentProvider.STRIPE,
      providerSubscriptionId: 'sub_current',
      autoRenewalChangeId: operationId,
    });
  });

  it('replays a recorded confirmation error instead of retrying its transaction body', async () => {
    const { workflow, gateway, repository } = fixture();
    repository.completeAutoRenewalOperation.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(workflow.changeAutoRenewal(input)).rejects.toThrow('database unavailable');
    await expect(workflow.changeAutoRenewal(input)).rejects.toThrow('database unavailable');

    expect(repository.createAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
  });

  it.each([
    { code: 'P2034' },
    { code: '40001' },
    { code: 'P2010', meta: { code: '40001' } },
    { cause: { code: '40001' } },
  ])('passes the original conflict to datasource retries: %j', async (details) => {
    const { workflow, dataSource, repository, gateway, result } = fixture();
    const error = Object.assign(new Error('database conflict'), details);
    repository.findByUserId.mockRejectedValueOnce(error);
    dataSource.runTransaction.mockImplementationOnce(async (action) => {
      // The datasource must receive the exact driver error.
      // Model its internal retry without another runTransaction call or workflow-level sleep.
      await expect(action()).rejects.toBe(error);
      return action();
    });

    await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
    expect(repository.findByUserId).toHaveBeenCalledTimes(2);
    expect(dataSource.runTransaction).toHaveBeenCalledTimes(2);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
    expect(gateway.enable).toHaveBeenCalledTimes(1);
  });

  it('preserves non-conflict database errors until the datasource finishes handling them', async () => {
    const { workflow, dataSource, repository, gateway } = fixture();
    const error = Object.assign(new Error('connection lost'), { code: 'P1001' });
    repository.findByUserId.mockRejectedValueOnce(error);
    dataSource.runTransaction.mockImplementationOnce(async (action) => {
      await expect(action()).rejects.toBe(error);
      throw error;
    });

    await expect(workflow.changeAutoRenewal(input)).rejects.toBe(error);
    expect(dataSource.runTransaction).toHaveBeenCalledTimes(1);
    expect(repository.findByUserId).toHaveBeenCalledTimes(1);
    expect(gateway.enable).not.toHaveBeenCalled();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('reuses the durable UUID and checkpoints when recovery re-enters the workflow body', async () => {
    const { workflow, gateway, repository, result } = fixture();
    await workflow.changeAutoRenewal(input);
    // DBOS returns recorded UUID/transaction/step results during replay; the double models that boundary.
    await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
    expect(repository.findByUserId).toHaveBeenCalledTimes(1);
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
  });

  it('replays completed checkpoints without overwriting a later opposite change', async () => {
    const { workflow, gateway, repository, subscription, result } = fixture();
    await workflow.changeAutoRenewal(input);

    // A later independent operation has disabled auto-renewal after the first workflow completed.
    subscription.autoRenewalStatus = AutoRenewalStatus.DISABLED;
    repository.findByUserId.mockRejectedValue(new Error('completed preparation must not run again'));
    repository.completeAutoRenewalOperation.mockRejectedValue(
      new Error('completed confirmation must not run again'),
    );

    await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
    expect(subscription.autoRenewalStatus).toBe(AutoRenewalStatus.DISABLED);
    expect(repository.createAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
    expect(gateway.disable).not.toHaveBeenCalled();
  });

  it('does not retry a serialized business conflict or contact the provider', async () => {
    const { workflow, repository, gateway } = fixture();
    repository.findByUserId.mockRejectedValue(
      new SubscriptionAutoRenewalConflictError('AUTO_RENEWAL_CHANGE_IN_PROGRESS'),
    );
    await expect(workflow.changeAutoRenewal(input)).rejects.toMatchObject({
      name: SubscriptionAutoRenewalConflictError.name,
      message: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS',
    });
    expect(repository.findByUserId).toHaveBeenCalledTimes(1);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
    expect(gateway.enable).not.toHaveBeenCalled();
  });

  it.each([new PaymentProviderUnavailableError(), new PaymentProviderOutcomeUnknownError()])(
    'retries a provider error with the same snapshot: %s',
    async (error) => {
      const { workflow, gateway, result } = fixture();
      gateway.enable.mockRejectedValueOnce(error);
      await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
      expect(gateway.enable).toHaveBeenCalledTimes(2);
      expect(gateway.enable.mock.calls[0]).toEqual(gateway.enable.mock.calls[1]);
    },
  );

  it.each([
    new PaymentProviderValidationError(),
    new PaymentProviderResultMismatchError('enable'),
    new Error('unknown provider error'),
  ])('does not retry or confirm a rejected provider request: %s', async (error) => {
    const { workflow, gateway, repository } = fixture();
    gateway.enable.mockRejectedValue(error);
    await expect(workflow.changeAutoRenewal(input)).rejects.toBe(error);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
    expect(repository.completeAutoRenewalOperation).not.toHaveBeenCalled();
  });

  it('leaves the prepared transition unresolved after the provider retry limit', async () => {
    const { workflow, gateway, repository } = fixture();
    gateway.enable.mockRejectedValue(new PaymentProviderOutcomeUnknownError());
    await expect(workflow.changeAutoRenewal(input)).rejects.toBeInstanceOf(
      PaymentProviderOutcomeUnknownError,
    );
    expect(gateway.enable).toHaveBeenCalledTimes(10);
    expect(repository.findByUserId).toHaveBeenCalledTimes(1);
    expect(repository.completeAutoRenewalOperation).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ operationId, workflowId: dbosMock.workflowID }),
    );
  });

  it('does not retry local failures or log raw database details', async () => {
    const { workflow, repository, gateway } = fixture();
    repository.completeAutoRenewalOperation.mockRejectedValue(new Error('sensitive SQL details'));
    await expect(workflow.changeAutoRenewal(input)).rejects.toThrow('sensitive SQL details');
    expect(repository.completeAutoRenewalOperation).toHaveBeenCalledTimes(1);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(Logger.prototype.error).mock.calls)).not.toContain('sensitive');
  });

  it('returns the stored workflow result on repeated starts', async () => {
    const { workflow, result } = fixture();
    const handle = {
      getStatus: vi.fn().mockResolvedValue({ input: [input] }),
      getResult: vi.fn().mockResolvedValue(result),
    };
    const start = vi.fn().mockResolvedValue(handle);
    dbosMock.startWorkflow.mockReturnValue({ changeAutoRenewal: start });
    await expect(workflow.execute(workflowParams)).resolves.toEqual(result);
    await expect(workflow.execute(workflowParams)).resolves.toEqual(result);
    expect(dbosMock.startWorkflow).toHaveBeenCalledWith(workflow, { workflowID: workflowParams.workflowId });
    expect(start).toHaveBeenCalledWith(input);
    expect(dbosMock.randomUUID).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, autoRenewalEnabled: false },
    { ...input, subscriptionId: 'other' },
  ])('rejects reuse of the client key with different stored arguments', async (saved) => {
    const { workflow } = fixture();
    const handle = { getStatus: vi.fn().mockResolvedValue({ input: [saved] }), getResult: vi.fn() };
    dbosMock.startWorkflow.mockReturnValue({ changeAutoRenewal: vi.fn().mockResolvedValue(handle) });
    await expect(workflow.execute(workflowParams)).rejects.toBeInstanceOf(
      SubscriptionAutoRenewalIdempotencyConflictError,
    );
    expect(handle.getResult).not.toHaveBeenCalled();
  });

  it('restores a saved workflow error without launching another operation', async () => {
    const { workflow } = fixture();
    const failure = new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_EXPIRED');
    const serialized = Object.assign(new Error(failure.message), { name: failure.name });
    const handle = {
      getStatus: vi.fn().mockResolvedValue({ input: [input] }),
      getResult: vi.fn().mockRejectedValue(serialized),
    };
    dbosMock.startWorkflow.mockReturnValue({ changeAutoRenewal: vi.fn().mockResolvedValue(handle) });
    await expect(workflow.execute(workflowParams)).rejects.toBeInstanceOf(
      SubscriptionAutoRenewalConflictError,
    );
    await expect(workflow.execute(workflowParams)).rejects.toMatchObject({ reason: 'SUBSCRIPTION_EXPIRED' });
    expect(dbosMock.randomUUID).not.toHaveBeenCalled();
  });

  it('returns a safe failure for an unknown stored error without launching another operation', async () => {
    const { workflow } = fixture();
    const handle = {
      getStatus: vi.fn().mockResolvedValue({ input: [input] }),
      getResult: vi.fn().mockRejectedValue(new Error('sensitive SQL details')),
    };
    dbosMock.startWorkflow.mockReturnValue({ changeAutoRenewal: vi.fn().mockResolvedValue(handle) });
    await expect(workflow.execute(workflowParams)).rejects.toBeInstanceOf(SubscriptionAutoRenewalFailedError);
    await expect(workflow.execute(workflowParams)).rejects.toMatchObject({
      code: 'AUTO_RENEWAL_INFRASTRUCTURE_FAILED',
    });
    expect(dbosMock.randomUUID).not.toHaveBeenCalled();
  });
});

function fixture(enabled = true) {
  const tx = {};
  const result = { operationId, subscriptionId: input.subscriptionId, autoRenewalEnabled: enabled };
  const subscription: SubscriptionForPayment = {
    subscriptionId: input.subscriptionId,
    planId: 1,
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_current',
    startsAt: new Date('2026-01-01'),
    expiresAt: new Date('2999-01-01'),
    status: SubscriptionStatus.ACTIVE,
    autoRenewalStatus: enabled ? AutoRenewalStatus.DISABLED : AutoRenewalStatus.ENABLED,
  };
  const repository = {
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    findByUserId: vi.fn<SubscriptionsRepository['findByUserId']>().mockResolvedValue([subscription]),
    createAutoRenewalOperation: vi.fn<SubscriptionsRepository['createAutoRenewalOperation']>().mockResolvedValue(),
    completeAutoRenewalOperation: vi.fn<SubscriptionsRepository['completeAutoRenewalOperation']>()
      .mockResolvedValue(),
  };
  const dataSource = {
    client: tx,
    runTransaction: vi.fn(async (action: () => Promise<unknown>, options: { name: string }) => {
      if (durable.transactions.has(options.name)) return durable.transactions.get(options.name);
      if (durable.transactionErrors.has(options.name)) throw durable.transactionErrors.get(options.name);
      durable.inTransaction = true;
      try {
        const result = await action();
        durable.transactions.set(options.name, result);
        return result;
      } catch (error) {
        // Datasource can deserialize a recorded error without retaining its original class or fields.
        const recordedError =
          error instanceof Error ? Object.assign(new Error(error.message), { name: error.name }) : error;
        durable.transactionErrors.set(options.name, recordedError);
        throw recordedError;
      } finally {
        durable.inTransaction = false;
      }
    }),
  };
  const gateway = {
    enable: vi.fn(async (_params: unknown) => {
      expect(durable.inTransaction).toBe(false);
      return { providerSubscriptionId: 'sub_current', autoRenewalEnabled: true };
    }),
    disable: vi.fn(async (_params: unknown) => {
      expect(durable.inTransaction).toBe(false);
      return { providerSubscriptionId: 'sub_current', autoRenewalEnabled: false };
    }),
  };
  const workflow = new DbosChangeSubscriptionAutoRenewalWorkflow(
    dataSource as unknown as PaymentsDbosDataSource,
    gateway,
    repository as unknown as SubscriptionsRepository,
  );
  return { workflow, dataSource, gateway, repository, subscription, result, tx };
}
