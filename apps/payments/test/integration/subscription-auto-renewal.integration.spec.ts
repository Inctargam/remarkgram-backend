import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/database/prisma/generated/client.js';
import { PrismaSubscriptionsRepository } from '../../src/features/subscriptions/infrastructure/persistence/prisma-subscriptions.repository.js';
import {
  PrepareSubscriptionAutoRenewalChangeCommand,
  PrepareSubscriptionAutoRenewalChangeUseCase,
} from '../../src/features/subscriptions/application/use-cases/prepare-subscription-auto-renewal-change/prepare-subscription-auto-renewal-change.use-case.js';
import {
  ConfirmSubscriptionAutoRenewalChangeCommand,
  ConfirmSubscriptionAutoRenewalChangeUseCase,
} from '../../src/features/subscriptions/application/use-cases/confirm-subscription-auto-renewal-change/confirm-subscription-auto-renewal-change.use-case.js';
import { ApplySuccessfulPaymentCommand, ApplySuccessfulPaymentUseCase } from '../../src/features/subscriptions/application/use-cases/apply-successful-payment/apply-successful-payment.use-case.js';
import type { SuccessfulPayment } from '../../src/features/payments/application/types/successful-payment.types.js';
import { PaymentProvider, PaymentType } from '../../src/features/payments/domain/payment.entity.js';
import { Currency, PeriodUnit } from '../../src/features/plans/domain/plan.entity.js';

const databaseUrl = process.env.PAYMENTS_INTEGRATION_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('Manual auto-renewal atomicity (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: PrismaSubscriptionsRepository;
  let prepare: PrepareSubscriptionAutoRenewalChangeUseCase;
  let confirm: ConfirmSubscriptionAutoRenewalChangeUseCase;
  let planId: number;
  const users: number[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    await prisma.$connect();
    planId = (await prisma.plan.create({
      data: { price: 1000, currency: 'USD', periodCount: 1, periodUnit: 'MONTH' },
    })).id;
    repository = new PrismaSubscriptionsRepository();
    prepare = new PrepareSubscriptionAutoRenewalChangeUseCase(repository);
    confirm = new ConfirmSubscriptionAutoRenewalChangeUseCase(repository);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.autoRenewalOperation.deleteMany({ where: { userId: { in: users } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    if (planId) await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('rolls back both preparation and confirmation when the owning transaction fails', async () => {
    const { params, subscription } = await fixture();
    const failure = new Error('fail before commit');
    await expect(prisma.$transaction(async (tx) => {
      await prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx));
      throw failure;
    })).rejects.toBe(failure);
    expect(await prisma.autoRenewalOperation.findUnique({ where: { id: params.operationId } })).toBeNull();
    expect(await prisma.subscription.findUnique({ where: { id: subscription.id } })).toMatchObject({ autoRenewalStatus: 'DISABLED' });

    await prisma.$transaction((tx) => prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx)));
    await expect(prisma.$transaction(async (tx) => {
      await confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx));
      throw failure;
    })).rejects.toBe(failure);
    expect(await prisma.autoRenewalOperation.findUnique({ where: { id: params.operationId } })).toMatchObject({ status: 'PENDING' });
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
      await prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx));
      entered();
      await held;
    }, { timeout: 10000 });
    await Promise.race([started, first]);
    const second = prisma.$transaction((tx) => prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(other, tx)));
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
    const apply = new ApplySuccessfulPaymentUseCase(repository);
    await expect(prisma.$transaction((tx) => apply.execute(new ApplySuccessfulPaymentCommand(payment, tx))))
      .rejects.toMatchObject({ reason: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS' });
    expect(await prisma.autoRenewalOperation.count({ where: { userId: params.userId } })).toBe(1);
  });

  it('keeps later manual state and access dates on a late confirmation replay', async () => {
    const { params, subscription } = await fixture();
    await prisma.$transaction((tx) => prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(params, tx)));
    await prisma.$transaction((tx) => confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx)));
    const disable = { ...params, operationId: randomUUID(), autoRenewalEnabled: false };
    await prisma.$transaction((tx) => prepare.execute(new PrepareSubscriptionAutoRenewalChangeCommand(disable, tx)));
    await prisma.$transaction((tx) => confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(disable, tx)));
    await expect(prisma.$transaction((tx) => confirm.execute(new ConfirmSubscriptionAutoRenewalChangeCommand(params, tx))))
      .resolves.toMatchObject({ autoRenewalEnabled: true });
    expect(await prisma.subscription.findUnique({ where: { id: subscription.id } })).toMatchObject({
      autoRenewalStatus: 'DISABLED', providerSubscriptionId: subscription.providerSubscriptionId,
      startsAt: subscription.startsAt, expiresAt: subscription.expiresAt, status: subscription.status,
    });
    expect(await prisma.autoRenewalOperation.count({ where: { userId: params.userId } })).toBe(2);
  });

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
