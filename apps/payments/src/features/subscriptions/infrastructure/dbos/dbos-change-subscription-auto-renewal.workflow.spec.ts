import type * as DbosSdk from '@dbos-inc/dbos-sdk';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const durable = vi.hoisted(() => ({
  steps: new Map<string, unknown>(),
  transactions: new Map<string, unknown>(),
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
import type { PrepareSubscriptionAutoRenewalChangeUseCase } from '../../application/use-cases/prepare-subscription-auto-renewal-change/prepare-subscription-auto-renewal-change.use-case.js';
import type { ConfirmSubscriptionAutoRenewalChangeUseCase } from '../../application/use-cases/confirm-subscription-auto-renewal-change/confirm-subscription-auto-renewal-change.use-case.js';
import { DbosChangeSubscriptionAutoRenewalWorkflow } from './dbos-change-subscription-auto-renewal.workflow.js';

const input = { userId: 42, subscriptionId: 'subscription', autoRenewalEnabled: true };
const operationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const workflowParams = { ...input, workflowId: 'subscription-auto-renewal:42:key' };

beforeEach(() => {
  vi.clearAllMocks();
  durable.steps.clear();
  durable.transactions.clear();
  durable.inTransaction = false;
  dbosMock.randomUUID.mockResolvedValue(operationId);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('DbosChangeSubscriptionAutoRenewalWorkflow', () => {
  it.each([true, false])(
    'calls D1 outside a transaction with the stable operation ID, enabled=%s',
    async (enabled) => {
      const { workflow, dataSource, gateway, prepare, confirm, prepared, result, tx } = fixture();
      prepared.autoRenewalEnabled = enabled;
      result.autoRenewalEnabled = enabled;
      await expect(workflow.changeAutoRenewal({ ...input, autoRenewalEnabled: enabled })).resolves.toEqual(
        result,
      );
      expect(dbosMock.randomUUID).toHaveBeenCalledTimes(1);
      expect(prepare.execute).toHaveBeenCalledWith(expect.objectContaining({ tx }));
      expect(confirm.execute).toHaveBeenCalledWith(expect.objectContaining({ tx }));
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

  it('skips the provider and confirmation for an already completed operation', async () => {
    const { workflow, gateway, confirm, prepared, result } = fixture();
    prepared.completed = true;
    await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
    expect(gateway.enable).not.toHaveBeenCalled();
    expect(confirm.execute).not.toHaveBeenCalled();
  });

  it('fails once when local confirmation fails after a successful provider step', async () => {
    const { workflow, dataSource, gateway, confirm } = fixture();
    confirm.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.changeAutoRenewal(input)).rejects.toThrow('database unavailable');
    expect(confirm.execute).toHaveBeenCalledTimes(1);
    expect(dataSource.runTransaction).toHaveBeenCalledTimes(2);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'P2034' },
    { code: '40001' },
    { code: 'P2010', meta: { code: '40001' } },
    { cause: { code: '40001' } },
  ])('passes the original conflict to datasource retries: %j', async (details) => {
    const { workflow, dataSource, prepare, gateway, result } = fixture();
    const error = Object.assign(new Error('database conflict'), details);
    prepare.execute.mockRejectedValueOnce(error);
    dataSource.runTransaction.mockImplementationOnce(async (action) => {
      // The datasource must receive the exact driver error.
      // Model its internal retry without another runTransaction call or workflow-level sleep.
      await expect(action()).rejects.toBe(error);
      return action();
    });

    await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
    expect(prepare.execute).toHaveBeenCalledTimes(2);
    expect(dataSource.runTransaction).toHaveBeenCalledTimes(2);
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
    expect(gateway.enable).toHaveBeenCalledTimes(1);
  });

  it('preserves non-conflict database errors until the datasource finishes handling them', async () => {
    const { workflow, dataSource, prepare, gateway } = fixture();
    const error = Object.assign(new Error('connection lost'), { code: 'P1001' });
    prepare.execute.mockRejectedValueOnce(error);
    dataSource.runTransaction.mockImplementationOnce(async (action) => {
      await expect(action()).rejects.toBe(error);
      throw error;
    });

    await expect(workflow.changeAutoRenewal(input)).rejects.toBe(error);
    expect(dataSource.runTransaction).toHaveBeenCalledTimes(1);
    expect(prepare.execute).toHaveBeenCalledTimes(1);
    expect(gateway.enable).not.toHaveBeenCalled();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('reuses the durable UUID and checkpoints when recovery re-enters the workflow body', async () => {
    const { workflow, gateway, prepare, confirm, result } = fixture();
    await workflow.changeAutoRenewal(input);
    // DBOS returns recorded UUID/transaction/step results during replay; the double models that boundary.
    await expect(workflow.changeAutoRenewal(input)).resolves.toEqual(result);
    expect(prepare.execute).toHaveBeenCalledTimes(1);
    expect(confirm.execute).toHaveBeenCalledTimes(1);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
  });

  it('does not retry a serialized business conflict or contact the provider', async () => {
    const { workflow, prepare, gateway } = fixture();
    prepare.execute.mockRejectedValue(
      new SubscriptionAutoRenewalConflictError('AUTO_RENEWAL_CHANGE_IN_PROGRESS'),
    );
    await expect(workflow.changeAutoRenewal(input)).rejects.toMatchObject({
      name: SubscriptionAutoRenewalConflictError.name,
      message: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS',
    });
    expect(prepare.execute).toHaveBeenCalledTimes(1);
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
    const { workflow, gateway, confirm } = fixture();
    gateway.enable.mockRejectedValue(error);
    await expect(workflow.changeAutoRenewal(input)).rejects.toBe(error);
    expect(gateway.enable).toHaveBeenCalledTimes(1);
    expect(confirm.execute).not.toHaveBeenCalled();
  });

  it('leaves the prepared transition unresolved after the provider retry limit', async () => {
    const { workflow, gateway, confirm, prepare } = fixture();
    gateway.enable.mockRejectedValue(new PaymentProviderOutcomeUnknownError());
    await expect(workflow.changeAutoRenewal(input)).rejects.toBeInstanceOf(
      PaymentProviderOutcomeUnknownError,
    );
    expect(gateway.enable).toHaveBeenCalledTimes(10);
    expect(prepare.execute).toHaveBeenCalledTimes(1);
    expect(confirm.execute).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ operationId, workflowId: dbosMock.workflowID }),
    );
  });

  it('does not retry local failures or log raw database details', async () => {
    const { workflow, confirm, gateway } = fixture();
    confirm.execute.mockRejectedValue(new Error('sensitive SQL details'));
    await expect(workflow.changeAutoRenewal(input)).rejects.toThrow('sensitive SQL details');
    expect(confirm.execute).toHaveBeenCalledTimes(1);
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

function fixture() {
  const tx = {};
  const result = { operationId, subscriptionId: input.subscriptionId, autoRenewalEnabled: true };
  const prepared = {
    ...input,
    operationId,
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_current',
    completed: false,
  };
  const prepare = {
    execute: vi.fn<PrepareSubscriptionAutoRenewalChangeUseCase['execute']>().mockResolvedValue(prepared),
  };
  const confirm = {
    execute: vi.fn<ConfirmSubscriptionAutoRenewalChangeUseCase['execute']>().mockResolvedValue(result),
  };
  const dataSource = {
    client: tx,
    runTransaction: vi.fn(async (action: () => Promise<unknown>, options: { name: string }) => {
      if (durable.transactions.has(options.name)) return durable.transactions.get(options.name);
      durable.inTransaction = true;
      try {
        const result = await action();
        durable.transactions.set(options.name, result);
        return result;
      } catch (error) {
        // Datasource can deserialize a recorded error without retaining its original class or fields.
        if (error instanceof Error) throw Object.assign(new Error(error.message), { name: error.name });
        throw error;
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
    prepare as unknown as PrepareSubscriptionAutoRenewalChangeUseCase,
    confirm as unknown as ConfirmSubscriptionAutoRenewalChangeUseCase,
  );
  return { workflow, dataSource, gateway, prepare, confirm, prepared, result, tx };
}
