import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../database/prisma.service.js';
import { Prisma } from '../../../../database/prisma/generated/client.js';
import { PaymentProvider } from '../../../payments/domain/payment.entity.js';
import { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';
import { SubscriptionPaymentProcessingStatus } from '../../domain/enums/subscription-payment-processing-status.enum.js';
import type {
  BindProviderSubscriptionRepositoryParams,
  CreateSubscriptionRepositoryParams,
} from '../../application/types/subscriptions.types.js';
import { PrismaSubscriptionsRepository } from './prisma-subscriptions.repository.js';

describe('PrismaSubscriptionsRepository: payment application', () => {
  it('reads the operation by primary key without loading either subscription state', async () => {
    const { repository, tx } = fixture();
    tx.subscriptionPaymentApplication.findUnique.mockResolvedValue({
      paymentId: 'payment-id',
      payment: { userId: 42 },
      subscriptionId: 'new-subscription',
      previousSubscriptionId: 'old-subscription',
      previousProviderSubscriptionId: 'sub_old',
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: new Date('2026-12-01T00:00:00.000Z'),
      processingStatus: 'COMPLETED',
      boundProviderSubscriptionId: 'sub_new',
    });

    await expect(repository.findPaymentApplication('payment-id', tx)).resolves.toEqual({
      paymentId: 'payment-id',
      userId: 42,
      previousSubscriptionId: 'old-subscription',
      processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
      boundProviderSubscriptionId: 'sub_new',
      result: {
        subscriptionId: 'new-subscription',
        action: 'SCHEDULED',
        nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
        previousProviderSubscriptionId: 'sub_old',
      },
    });
    expect(tx.subscriptionPaymentApplication.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { paymentId: 'payment-id' },
      select: {
        paymentId: true,
        payment: { select: { userId: true } },
        previousSubscriptionId: true,
        processingStatus: true,
        boundProviderSubscriptionId: true,
        subscriptionId: true,
        action: true,
        nextSubscriptionStartsAt: true,
        previousProviderSubscriptionId: true,
      },
    });
  });

  it('resolves cancellation by the D1 subscription/provider pair and detects ambiguity', async () => {
    const { repository, tx } = fixture();
    const row = {
      paymentId: 'payment-id',
      payment: { userId: 42 },
      subscriptionId: 'new-subscription',
      previousSubscriptionId: 'old-subscription',
      previousProviderSubscriptionId: 'sub_old',
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: new Date('2026-12-01T00:00:00.000Z'),
      processingStatus: 'BINDING_PENDING',
      boundProviderSubscriptionId: null,
    };
    tx.subscriptionPaymentApplication.findMany.mockResolvedValue([
      row,
      { ...row, paymentId: 'other-payment' },
    ]);

    const applications = await repository.findCancellationApplications('new-subscription', 'sub_old', tx);

    expect(applications.map((application) => application.paymentId)).toEqual(['payment-id', 'other-payment']);
    expect(applications[0].processingStatus).toBe(SubscriptionPaymentProcessingStatus.BINDING_PENDING);
    expect(tx.subscriptionPaymentApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscriptionId: 'new-subscription',
          previousProviderSubscriptionId: 'sub_old',
          action: 'SCHEDULED',
        },
        take: 2,
      }),
    );
    tx.subscriptionPaymentApplication.findMany.mockResolvedValue([]);
    await expect(repository.findCancellationApplications('new-subscription', 'sub_other', tx)).resolves.toEqual([]);
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

  it.each([
    ['CREATED', SubscriptionPaymentProcessingStatus.COMPLETED],
    ['SCHEDULED', SubscriptionPaymentProcessingStatus.CANCELLATION_PENDING],
  ] as const)('persists the prepared initial stage for %s in the nested creation', async (action, processingStatus) => {
    const { repository, tx } = fixture();
    const params = creationParams();
    params.result.action = action;
    params.processingStatus = processingStatus;
    if (action === 'SCHEDULED') {
      params.previousSubscriptionId = 'old-subscription';
      params.result.previousProviderSubscriptionId = 'sub_old';
      params.providerSubscriptionId = null;
      params.autoRenewalStatus = AutoRenewalStatus.ENABLING;
      params.autoRenewalChangeId = params.paymentId;
    }

    await repository.createWithPaymentApplication(params, tx);

    expect(tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentApplications: {
            create: {
              paymentId: params.paymentId,
              previousSubscriptionId: params.previousSubscriptionId,
              previousProviderSubscriptionId: params.result.previousProviderSubscriptionId,
              action,
              processingStatus,
              nextSubscriptionStartsAt: new Date(params.result.nextSubscriptionStartsAt),
            },
          },
        }),
      }),
    );
  });

  it('stores renewal as completed without a binding snapshot or auto-renewal changes', async () => {
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
            processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
            nextSubscriptionStartsAt: new Date(params.result.nextSubscriptionStartsAt),
          },
        },
      },
    });
  });

  it('retires the old subscription and advances the stage in one nested write', async () => {
    const { repository, tx } = fixture();

    await repository.completeProviderSubscriptionCancellation(cancellationParams(), tx);

    expect(tx.subscriptionPaymentApplication.update).toHaveBeenCalledExactlyOnceWith({
      where: { paymentId: 'payment-id' },
      data: {
        processingStatus: SubscriptionPaymentProcessingStatus.BINDING_PENDING,
        previousSubscription: {
          update: { autoRenewalStatus: AutoRenewalStatus.RETIRED, autoRenewalChangeId: 'payment-id' },
        },
      },
    });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('binds and completes in one nested write, preserving dates and change ID', async () => {
    const { repository, tx } = fixture();

    await repository.bindProviderSubscription(bindingParams(), tx);

    expect(tx.subscriptionPaymentApplication.update).toHaveBeenCalledExactlyOnceWith({
      where: { paymentId: 'payment-id' },
      data: {
        processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
        boundProviderSubscriptionId: 'sub_new',
        subscription: {
          update: { providerSubscriptionId: 'sub_new', autoRenewalStatus: AutoRenewalStatus.ENABLED },
        },
      },
    });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('translates a duplicate provider binding into an application conflict', async () => {
    const { repository, tx } = fixture();
    tx.subscriptionPaymentApplication.update.mockRejectedValue(
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
  ])('propagates other nested-write errors to the transaction owner: %s', async (error) => {
    const { repository, tx } = fixture();
    tx.subscriptionPaymentApplication.update.mockRejectedValue(error);

    await expect(repository.bindProviderSubscription(bindingParams(), tx)).rejects.toBe(error);
    await expect(repository.completeProviderSubscriptionCancellation(cancellationParams(), tx)).rejects.toBe(error);
  });
});

function fixture() {
  const tx = {
    $executeRaw: vi.fn<(sql: TemplateStringsArray, key: string) => Promise<number>>().mockResolvedValue(1),
    subscription: { create: vi.fn(), update: vi.fn() },
    subscriptionPaymentApplication: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  };
  // Любая попытка использовать корневой Prisma client вместо переданного tx должна упасть.
  return { tx, repository: new PrismaSubscriptionsRepository({} as PrismaService) };
}

function cancellationParams() {
  return {
    paymentId: 'payment-id',
    autoRenewalStatus: AutoRenewalStatus.RETIRED,
    processingStatus: SubscriptionPaymentProcessingStatus.BINDING_PENDING,
  };
}

function bindingParams(): BindProviderSubscriptionRepositoryParams {
  return {
    paymentId: 'payment-id',
    providerSubscriptionId: 'sub_new',
    autoRenewalStatus: AutoRenewalStatus.ENABLED,
    processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
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
    autoRenewalChangeId: null,
    previousSubscriptionId: null,
    processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
    result: {
      subscriptionId: 'new-subscription',
      action: 'CREATED',
      nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
      previousProviderSubscriptionId: null,
    },
  };
}
