import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type * as DbosSdk from '@dbos-inc/dbos-sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../../src/database/prisma/generated/client.js';
import { PrismaSubscriptionsRepository } from '../../src/features/subscriptions/infrastructure/persistence/prisma-subscriptions.repository.js';
import { DbosChangeSubscriptionAutoRenewalWorkflow } from '../../src/features/subscriptions/infrastructure/dbos/dbos-change-subscription-auto-renewal.workflow.js';
import type { PaymentsDbosDataSource } from '../../src/features/payments/infrastructure/dbos/payments-dbos.datasource.js';
import type { PaymentsTransactionContext } from '../../src/features/payments/application/ports/payments-unit-of-work.js';
import { ApplySuccessfulPaymentCommand, ApplySuccessfulPaymentUseCase } from '../../src/features/subscriptions/application/use-cases/apply-successful-payment/apply-successful-payment.use-case.js';
import type { RecordBusinessAccessService } from '../../src/features/subscriptions/application/services/record-business-access.service.js';
import type { SuccessfulPayment } from '../../src/features/payments/application/types/successful-payment.types.js';
import { PaymentProvider, PaymentType } from '../../src/features/payments/domain/payment.entity.js';
import { Currency, PeriodUnit } from '../../src/features/plans/domain/plan.entity.js';

vi.mock('@dbos-inc/dbos-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof DbosSdk>()),
  ConfiguredInstance: class ConfiguredInstance {},
}));

const databaseUrl = process.env.PAYMENTS_INTEGRATION_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('Manual auto-renewal atomicity (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: PrismaSubscriptionsRepository;
  let planId: number;
  const users: number[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    await prisma.$connect();
    planId = (await prisma.plan.create({
      data: { price: 1000, currency: 'USD', periodCount: 1, periodUnit: 'MONTH' },
    })).id;
    repository = new PrismaSubscriptionsRepository();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.autoRenewalOperation.deleteMany({ where: { userId: { in: users } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    if (planId) await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('does not persist an operation or change the subscription when the requested state is already set', async () => {
    const { params, subscription } = await fixture();
    const request = { ...params, autoRenewalEnabled: false };

    await expect(prisma.$transaction((tx) => steps(tx)['prepare'](request)))
      .resolves.toMatchObject({ operationId: request.operationId, completed: true });
    expect(await prisma.autoRenewalOperation.count({ where: { userId: request.userId } })).toBe(0);
    expect(await prisma.subscription.findUnique({ where: { id: subscription.id } })).toEqual(subscription);
  });

  it('rolls back both preparation and confirmation when the owning transaction fails', async () => {
    const { params, subscription } = await fixture();
    const failure = new Error('fail before commit');
    await expect(prisma.$transaction(async (tx) => {
      await steps(tx)['prepare'](params);
      throw failure;
    })).rejects.toBe(failure);
    expect(await prisma.autoRenewalOperation.findUnique({ where: { id: params.operationId } })).toBeNull();
    expect(await prisma.subscription.findUnique({ where: { id: subscription.id } })).toMatchObject({ autoRenewalStatus: 'DISABLED' });

    await prisma.$transaction((tx) => steps(tx)['prepare'](params));
    await expect(prisma.$transaction(async (tx) => {
      await steps(tx)['confirm'](params);
      throw failure;
    })).rejects.toBe(failure);
    expect(await prisma.autoRenewalOperation.findUnique({ where: { id: params.operationId } })).toMatchObject({ status: 'ENABLE_PENDING' });
    expect(await prisma.subscription.findUnique({ where: { id: subscription.id } })).toMatchObject({ autoRenewalStatus: 'ENABLING' });
  });

  it('serializes competing manual operations and blocks payment application during the transition', async () => {
    const { params } = await fixture();
    const other = { ...params, operationId: randomUUID(), autoRenewalEnabled: false };
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const first = prisma.$transaction(async (tx) => {
      await steps(tx)['prepare'](params);
      entered();
      await held;
    }, { timeout: 10000 });
    await Promise.race([started, first]);
    const second = prisma.$transaction((tx) => steps(tx)['prepare'](other));
    const rejected = expect(second).rejects.toMatchObject({ reason: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS' });
    release();
    await first;
    await rejected;

    const payment: SuccessfulPayment = {
      paymentId: randomUUID(), userId: params.userId, planId, type: PaymentType.PURCHASE,
      autoRenewalRequested: true, amount: 1000, currency: Currency.USD, periodCount: 1,
      periodUnit: PeriodUnit.MONTH, provider: PaymentProvider.STRIPE, providerSubscriptionId: 'sub_new',
      providerCustomerId: 'cus_test', paidAt: new Date().toISOString(),
    };
    const apply = new ApplySuccessfulPaymentUseCase(repository, { execute: vi.fn() } as unknown as RecordBusinessAccessService);
    await expect(prisma.$transaction((tx) => apply.execute(new ApplySuccessfulPaymentCommand(payment, tx))))
      .rejects.toMatchObject({ reason: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS' });
    expect(await prisma.autoRenewalOperation.count({ where: { userId: params.userId } })).toBe(1);
  });

  it('applies opposite operations without changing access dates or the provider binding', async () => {
    const { params, subscription } = await fixture();
    await prisma.$transaction((tx) => steps(tx)['prepare'](params));
    await prisma.$transaction((tx) => steps(tx)['confirm'](params));
    const disable = { ...params, operationId: randomUUID(), autoRenewalEnabled: false };
    await prisma.$transaction((tx) => steps(tx)['prepare'](disable));
    await prisma.$transaction((tx) => steps(tx)['confirm'](disable));
    expect(await prisma.subscription.findUnique({ where: { id: subscription.id } })).toMatchObject({
      autoRenewalStatus: 'DISABLED', providerSubscriptionId: subscription.providerSubscriptionId,
      startsAt: subscription.startsAt, expiresAt: subscription.expiresAt, status: subscription.status,
    });
    expect(await prisma.autoRenewalOperation.count({ where: { userId: params.userId } })).toBe(2);
    expect(await prisma.autoRenewalOperation.count({
      where: { userId: params.userId, status: 'COMPLETED' },
    })).toBe(2);
  });

  // Run the real workflow methods in the transaction owned by each integration scenario.
  // DBOS checkpoints are covered separately in the workflow tests.
  function steps(tx: PaymentsTransactionContext) {
    const dataSource = {
      client: tx,
      runTransaction: async <T>(action: () => Promise<T>) => action(),
    };
    return new DbosChangeSubscriptionAutoRenewalWorkflow(
      dataSource as unknown as PaymentsDbosDataSource,
      { enable: vi.fn(), disable: vi.fn() },
      repository,
    );
  }

  async function fixture() {
    const userId = 100000000 + Math.floor(Math.random() * 1000000000);
    users.push(userId);
    const now = Date.now();
    const subscription = await prisma.subscription.create({
      data: {
        userId, planId, startsAt: new Date(now - 86400000), expiresAt: new Date(now + 86400000),
        status: 'ACTIVE', provider: 'STRIPE', providerSubscriptionId: `sub_${randomUUID()}`,
        autoRenewalStatus: 'DISABLED',
      },
    });
    return {
      subscription,
      params: { operationId: randomUUID(), userId, subscriptionId: subscription.id, autoRenewalEnabled: true },
    };
  }
});
