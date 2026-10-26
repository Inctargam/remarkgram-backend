import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../database/prisma.service.js';
import { Prisma } from '../../../../database/prisma/generated/client.js';
import { PaymentProvider } from '../../../payments/domain/payment.entity.js';
import { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';
import { AutoRenewalOperationStatus } from '../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../domain/enums/auto-renewal-operation-type.enum.js';
import type {
  AutoRenewalOperation,
  BindProviderSubscriptionRepositoryParams,
  CreateSubscriptionRepositoryParams,
} from '../../application/types/subscriptions.types.js';
import { PrismaSubscriptionsRepository } from './prisma-subscriptions.repository.js';

describe('PrismaSubscriptionsRepository: payment application', () => {
  it('reconstructs the original result from the operation snapshot without reading subscription states', async () => {
    const { repository, tx } = fixture();
    const operation = transferOperation();
    operation.status = AutoRenewalOperationStatus.COMPLETED;
    operation.providerSubscriptionId = 'sub_new';
    tx.subscriptionPaymentApplication.findUnique.mockResolvedValue({
      paymentId: 'payment-id',
      payment: { userId: 42 },
      subscriptionId: 'new-subscription',
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: new Date('2026-12-01T00:00:00.000Z'),
      autoRenewalOperation: operation,
    });

    await expect(repository.findPaymentApplication('payment-id', tx)).resolves.toEqual({
      paymentId: 'payment-id',
      userId: 42,
      autoRenewalOperation: operation,
      result: {
        subscriptionId: 'new-subscription',
        action: 'SCHEDULED',
        nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
        previousProviderSubscriptionId: 'sub_old',
      },
    });
    const [query] = tx.subscriptionPaymentApplication.findUnique.mock.calls[0];
    expect(query.where).toEqual({ paymentId: 'payment-id' });
    expect(query.select.autoRenewalOperation.select).toMatchObject({
      sourceProviderSubscriptionId: true,
      providerSubscriptionId: true,
      status: true,
    });
    expect(query.select.subscription).toBeUndefined();
    expect(query.select.autoRenewalOperation.select.subscription).toBeUndefined();
    expect(query.select.autoRenewalOperation.select.sourceSubscription).toBeUndefined();
  });

  it.each(['CREATED', 'RENEWED'])('reads %s without an auto-renewal operation', async (action) => {
    const { repository, tx } = fixture();
    tx.subscriptionPaymentApplication.findUnique.mockResolvedValue({
      paymentId: 'payment-id',
      payment: { userId: 42 },
      subscriptionId: 'new-subscription',
      action,
      nextSubscriptionStartsAt: new Date('2026-12-01T00:00:00.000Z'),
      autoRenewalOperation: null,
    });

    await expect(repository.findPaymentApplication('payment-id', tx)).resolves.toMatchObject({
      autoRenewalOperation: null,
      result: { action, previousProviderSubscriptionId: null },
    });
  });

  it('resolves cancellation by the old D1 arguments, excluding manual operations and limiting ambiguity', async () => {
    const { repository, tx } = fixture();
    const operation = transferOperation();
    tx.autoRenewalOperation.findMany.mockResolvedValue([
      operation,
      { ...operation, id: 'other-operation', paymentId: 'other-payment' },
    ]);

    const operations = await repository.findCancellationOperations('new-subscription', 'sub_old', tx);

    expect(operations.map((item) => item.paymentId)).toEqual(['payment-id', 'other-payment']);
    expect(operations[0]).toEqual(operation);
    expect(tx.autoRenewalOperation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscriptionId: 'new-subscription',
          sourceProviderSubscriptionId: 'sub_old',
          type: AutoRenewalOperationType.TRANSFER,
          paymentApplication: { is: { action: 'SCHEDULED' } },
        },
        take: 2,
      }),
    );
    tx.autoRenewalOperation.findMany.mockResolvedValue([]);
    await expect(repository.findCancellationOperations('new-subscription', 'sub_other', tx)).resolves.toEqual([]);
  });

  it('returns null for an unknown payment', async () => {
    const { repository, tx } = fixture();
    tx.subscriptionPaymentApplication.findUnique.mockResolvedValue(null);

    await expect(repository.findPaymentApplication('missing', tx)).resolves.toBeNull();
  });

  it('uses the common transaction-scoped user lock', async () => {
    const { repository, tx } = fixture();

    await repository.lockByUserId(42, tx);

    const [sql, key] = tx.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toContain('pg_advisory_xact_lock(hashtextextended(?, 0))');
    expect(key).toBe('subscriptions:user:42');
  });

  it.each(['CREATED', 'SCHEDULED'] as const)(
    'creates %s and its required records in one nested write',
    async (action) => {
      const { repository, tx } = fixture();
      const params = creationParams();
      params.result.action = action;
      if (action === 'SCHEDULED') {
        params.autoRenewalOperation = transferOperation();
        params.result.previousProviderSubscriptionId = 'sub_old';
        params.providerSubscriptionId = null;
        params.autoRenewalStatus = AutoRenewalStatus.ENABLING;
      }

      await repository.createWithPaymentApplication(params, tx);

      expect(tx.subscription.create).toHaveBeenCalledTimes(1);
      const [query] = tx.subscription.create.mock.calls[0];
      const application = query.data.paymentApplications.create;
      expect(application).toEqual({
        paymentId: params.paymentId,
        action,
        nextSubscriptionStartsAt: new Date(params.result.nextSubscriptionStartsAt),
        autoRenewalOperation:
          action === 'SCHEDULED'
            ? {
                create: {
                  id: params.paymentId,
                  userId: 42,
                  type: AutoRenewalOperationType.TRANSFER,
                  status: AutoRenewalOperationStatus.PENDING,
                  subscriptionId: 'new-subscription',
                  provider: PaymentProvider.STRIPE,
                  providerSubscriptionId: null,
                  sourceSubscriptionId: 'old-subscription',
                  sourceProviderSubscriptionId: 'sub_old',
                },
              }
            : undefined,
      });
      expect(query.data).not.toHaveProperty('autoRenewalChangeId');
      expect(application).not.toHaveProperty('processingStatus');
      expect(tx.autoRenewalOperation.update).not.toHaveBeenCalled();
    },
  );

  it('records a renewal without an auto-renewal operation or changes to auto-renewal', async () => {
    const { repository, tx } = fixture();
    const params = creationParams();
    params.result.action = 'RENEWED';

    await repository.renewWithPaymentApplication(params, tx);

    expect(tx.subscription.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: params.result.subscriptionId },
      data: {
        expiresAt: params.expiresAt,
        status: params.status,
        paymentApplications: {
          create: {
            paymentId: params.paymentId,
            action: 'RENEWED',
            nextSubscriptionStartsAt: new Date(params.result.nextSubscriptionStartsAt),
          },
        },
      },
    });
  });

  it('retires the old subscription and advances the operation in one nested write', async () => {
    const { repository, tx } = fixture();

    await repository.completeProviderSubscriptionCancellation(cancellationParams(), tx);

    expect(tx.autoRenewalOperation.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'payment-id' },
      data: {
        status: AutoRenewalOperationStatus.BINDING_PENDING,
        sourceSubscription: { update: { autoRenewalStatus: AutoRenewalStatus.RETIRED } },
      },
    });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('binds and completes in one nested write, preserving access dates and the source snapshot', async () => {
    const { repository, tx } = fixture();

    await repository.bindProviderSubscription(bindingParams(), tx);

    expect(tx.autoRenewalOperation.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'payment-id' },
      data: {
        status: AutoRenewalOperationStatus.COMPLETED,
        providerSubscriptionId: 'sub_new',
        subscription: {
          update: { providerSubscriptionId: 'sub_new', autoRenewalStatus: AutoRenewalStatus.ENABLED },
        },
      },
    });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('translates a duplicate provider binding into an application conflict', async () => {
    const { repository, tx } = fixture();
    tx.autoRenewalOperation.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate provider binding', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(repository.bindProviderSubscription(bindingParams(), tx)).rejects.toMatchObject({
      name: 'SubscriptionBindingConflictError',
      paymentId: 'payment-id',
      reason: 'PROVIDER_SUBSCRIPTION_ALREADY_BOUND',
    });
  });

  it.each([
    new Error('database unavailable'),
    new Prisma.PrismaClientKnownRequestError('missing record', { code: 'P2025', clientVersion: '7.8.0' }),
  ])('propagates nested-write errors to the transaction owner: %s', async (error) => {
    const { repository, tx } = fixture();
    tx.autoRenewalOperation.update.mockRejectedValue(error);
    tx.subscription.create.mockRejectedValue(error);

    await expect(repository.bindProviderSubscription(bindingParams(), tx)).rejects.toBe(error);
    await expect(repository.completeProviderSubscriptionCancellation(cancellationParams(), tx)).rejects.toBe(error);
    const params = creationParams();
    params.autoRenewalOperation = transferOperation();
    params.result.action = 'SCHEDULED';
    await expect(repository.createWithPaymentApplication(params, tx)).rejects.toBe(error);
  });
});

function fixture() {
  const tx = {
    $executeRaw: vi.fn<(sql: TemplateStringsArray, key: string) => Promise<number>>().mockResolvedValue(1),
    subscription: { create: vi.fn(), update: vi.fn() },
    subscriptionPaymentApplication: { findUnique: vi.fn() },
    autoRenewalOperation: { findMany: vi.fn(), update: vi.fn() },
  };
  // Любая попытка использовать корневой Prisma client вместо переданного tx должна упасть.
  return { tx, repository: new PrismaSubscriptionsRepository({} as PrismaService) };
}

function cancellationParams() {
  return {
    operationId: 'payment-id',
    autoRenewalStatus: AutoRenewalStatus.RETIRED,
    status: AutoRenewalOperationStatus.BINDING_PENDING,
  };
}

function bindingParams(): BindProviderSubscriptionRepositoryParams {
  return {
    operationId: 'payment-id',
    paymentId: 'payment-id',
    providerSubscriptionId: 'sub_new',
    autoRenewalStatus: AutoRenewalStatus.ENABLED,
    status: AutoRenewalOperationStatus.COMPLETED,
  };
}

function transferOperation(): AutoRenewalOperation {
  return {
    id: 'payment-id',
    userId: 42,
    type: AutoRenewalOperationType.TRANSFER,
    status: AutoRenewalOperationStatus.PENDING,
    paymentId: 'payment-id',
    subscriptionId: 'new-subscription',
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: null,
    sourceSubscriptionId: 'old-subscription',
    sourceProviderSubscriptionId: 'sub_old',
  };
}

function creationParams(): CreateSubscriptionRepositoryParams {
  return {
    paymentId: 'payment-id',
    userId: 42,
    planId: 7,
    startsAt: new Date('2026-11-01T00:00:00.000Z'),
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    status: SubscriptionStatus.ACTIVE,
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_initial',
    autoRenewalStatus: AutoRenewalStatus.ENABLED,
    autoRenewalOperation: null,
    result: {
      subscriptionId: 'new-subscription',
      action: 'CREATED',
      nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
      previousProviderSubscriptionId: null,
    },
  };
}
