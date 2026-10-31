import { describe, expect, it, vi } from 'vitest';
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
  RenewSubscriptionRepositoryParams,
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

  it('reads a manual operation by its primary key without consulting mutable subscriptions', async () => {
    const { repository, tx } = fixture();
    const operation = { ...transferOperation(), type: AutoRenewalOperationType.DISABLE, paymentId: null };
    tx.autoRenewalOperation.findUnique.mockResolvedValue(operation);
    await expect(repository.findAutoRenewalOperation(operation.id, tx)).resolves.toEqual(operation);
    expect(tx.autoRenewalOperation.findUnique).toHaveBeenCalledWith({
      where: { id: operation.id }, select: expect.objectContaining({ providerSubscriptionId: true, status: true }),
    });
    tx.autoRenewalOperation.findUnique.mockResolvedValue(null);
    await expect(repository.findAutoRenewalOperation('missing', tx)).resolves.toBeNull();
  });

  it('stores manual intent and only the prepared auto-renewal state through the supplied tx', async () => {
    const { repository, tx } = fixture();
    const operation = {
      ...transferOperation(), type: AutoRenewalOperationType.ENABLE, paymentId: null,
      sourceSubscriptionId: null, sourceProviderSubscriptionId: null, providerSubscriptionId: 'sub_current',
    };
    await repository.createAutoRenewalOperation({ operation, autoRenewalStatus: AutoRenewalStatus.ENABLING }, tx);
    expect(tx.autoRenewalOperation.create).toHaveBeenCalledExactlyOnceWith({ data: operation });
    expect(tx.subscription.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: operation.subscriptionId }, data: { autoRenewalStatus: AutoRenewalStatus.ENABLING },
    });
  });

  it('does not update the subscription for an already satisfied manual request', async () => {
    const { repository, tx } = fixture();
    const operation = { ...transferOperation(), status: AutoRenewalOperationStatus.COMPLETED };
    await repository.createAutoRenewalOperation({ operation, autoRenewalStatus: null }, tx);
    expect(tx.autoRenewalOperation.create).toHaveBeenCalledWith({ data: operation });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('atomically confirms the prepared manual result without changing bindings or dates', async () => {
    const { repository, tx } = fixture();
    await repository.completeAutoRenewalOperation({
      operationId: 'operation',
      autoRenewalStatus: AutoRenewalStatus.DISABLED,
    }, tx);
    expect(tx.autoRenewalOperation.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'operation' }, data: {
        status: AutoRenewalOperationStatus.COMPLETED,
        subscription: { update: { autoRenewalStatus: AutoRenewalStatus.DISABLED } },
      },
    });
  });

  it('propagates a write error so the caller can roll back manual intent', async () => {
    const { repository, tx } = fixture();
    const error = new Error('subscription update failed');
    tx.subscription.update.mockRejectedValue(error);
    await expect(repository.createAutoRenewalOperation({
      operation: transferOperation(), autoRenewalStatus: AutoRenewalStatus.DISABLING,
    }, tx)).rejects.toBe(error);
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
      params.action = action;
      if (action === 'SCHEDULED') {
        params.autoRenewalTransfer = { sourceSubscriptionId: 'old-subscription', sourceProviderSubscriptionId: 'sub_old' };
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
        nextSubscriptionStartsAt: new Date(params.nextSubscriptionStartsAt),
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
    const params: RenewSubscriptionRepositoryParams = {
      paymentId: 'payment-id',
      subscriptionId: 'existing-subscription',
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      status: SubscriptionStatus.ACTIVE,
      nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
    };

    await repository.renewWithPaymentApplication(params, tx);

    expect(tx.subscription.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: params.subscriptionId },
      data: {
        expiresAt: params.expiresAt,
        status: params.status,
        paymentApplications: {
          create: {
            paymentId: params.paymentId,
            action: 'RENEWED',
            nextSubscriptionStartsAt: new Date(params.nextSubscriptionStartsAt),
          },
        },
      },
    });
  });

  it('retires the old subscription and advances the operation in one nested write', async () => {
    const { repository, tx } = fixture();

    await repository.confirmAutoRenewalCancellation('payment-id', tx);

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
    await expect(repository.confirmAutoRenewalCancellation('payment-id', tx)).rejects.toBe(error);
    const params = creationParams();
    params.autoRenewalTransfer = { sourceSubscriptionId: 'old-subscription', sourceProviderSubscriptionId: 'sub_old' };
    params.action = 'SCHEDULED';
    await expect(repository.createWithPaymentApplication(params, tx)).rejects.toBe(error);
  });
});

function fixture() {
  const tx = {
    $executeRaw: vi.fn<(sql: TemplateStringsArray, key: string) => Promise<number>>().mockResolvedValue(1),
    subscription: { create: vi.fn(), update: vi.fn() },
    subscriptionPaymentApplication: { findUnique: vi.fn() },
    autoRenewalOperation: { update: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  };
  // Репозиторий получает Prisma client только через переданный tx.
  return { tx, repository: new PrismaSubscriptionsRepository() };
}

function bindingParams(): BindProviderSubscriptionRepositoryParams {
  return {
    operationId: 'payment-id',
    providerSubscriptionId: 'sub_new',
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
    autoRenewalTransfer: null,
    subscriptionId: 'new-subscription',
    action: 'CREATED',
    nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
  };
}
