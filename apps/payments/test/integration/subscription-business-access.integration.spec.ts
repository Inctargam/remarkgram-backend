import { randomInt, randomUUID } from 'node:crypto';
import { Outbox, OutboxStorage, type OutboxRelay } from '@nestjs/outbox';
import { fromPrisma, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '../../src/database/prisma/generated/client.js';
import { Currency } from '../../src/common/domain/currency.enum.js';
import { PeriodUnit } from '../../src/common/domain/period-unit.enum.js';
import { PaymentProvider, PaymentType } from '../../src/features/payments/domain/payment.entity.js';
import type { SuccessfulPayment } from '../../src/features/payments/application/types/successful-payment.types.js';
import { PrismaSubscriptionsRepository } from '../../src/features/subscriptions/infrastructure/persistence/prisma-subscriptions.repository.js';
import { NestBusinessAccessEventsAdapter } from '../../src/features/subscriptions/infrastructure/outbox/nest-business-access-events.adapter.js';
import { RecordBusinessAccessService } from '../../src/features/subscriptions/application/services/record-business-access.service.js';
import { RefreshSubscriptionStatusesUseCase } from '../../src/features/subscriptions/application/use-cases/refresh-subscription-statuses/refresh-subscription-statuses.use-case.js';
import { ApplySuccessfulPaymentCommand, ApplySuccessfulPaymentUseCase } from '../../src/features/subscriptions/application/use-cases/apply-successful-payment/apply-successful-payment.use-case.js';

const databaseUrl = process.env.PAYMENTS_INTEGRATION_DATABASE_URL;
type AccessPayload = { userId: number; hasBusinessAccess: boolean; version: string };

// Требуется отдельная БД с применёнными миграциями; тест сам не создаёт/мигрирует схемы.
describe.runIf(Boolean(databaseUrl))('Subscription lifecycle and access outbox (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: PrismaSubscriptionsRepository;
  let access: RecordBusinessAccessService;
  let refresh: RefreshSubscriptionStatusesUseCase;
  let apply: ApplySuccessfulPaymentUseCase;
  let planId: number;
  const users: number[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    await prisma.$connect();
    const storage = new OutboxStorage();
    const store = new PostgresOutboxStore({ executor: fromPrisma(prisma), migrate: false }, storage);
    await store.onModuleInit();
    const outbox = new Outbox<Prisma.TransactionClient>(storage, { notify: vi.fn() } as unknown as OutboxRelay);
    repository = new PrismaSubscriptionsRepository();
    access = new RecordBusinessAccessService(repository, new NestBusinessAccessEventsAdapter(outbox));
    refresh = new RefreshSubscriptionStatusesUseCase(repository, access);
    apply = new ApplySuccessfulPaymentUseCase(repository, access);
    planId = (await prisma.plan.create({
      data: { price: 1000, currency: 'USD', periodCount: 1, periodUnit: 'MONTH' },
    })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (users.length > 0) {
      const keys = users.map((id) => `business-access:${id}`);
      await prisma.$executeRaw`DELETE FROM nest_outbox.messages WHERE key IN (${Prisma.join(keys)})`;
      await prisma.subscriptionPaymentApplication.deleteMany({ where: { payment: { userId: { in: users } } } });
      await prisma.payment.deleteMany({ where: { userId: { in: users } } });
      await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    }
    if (planId) await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('switches A to B atomically and records one enabled snapshot, then does nothing on replay', async () => {
    const userId = nextUser();
    const boundary = new Date(Date.now() - 60_000);
    const old = await subscription(userId, 'ACTIVE', new Date(boundary.getTime() - 86400000), boundary);
    const next = await subscription(userId, 'PENDING', boundary, new Date(Date.now() + 86400000));

    await prisma.$transaction((tx) => refresh.execute(userId, tx));

    expect(await prisma.subscription.findUnique({ where: { id: old.id } })).toMatchObject({ status: 'EXPIRED' });
    expect(await prisma.subscription.findUnique({ where: { id: next.id } })).toMatchObject({
      status: 'ACTIVE', startsAt: next.startsAt, expiresAt: next.expiresAt,
      autoRenewalStatus: next.autoRenewalStatus, providerSubscriptionId: next.providerSubscriptionId,
    });
    expect(await messages(userId)).toEqual([
      expect.objectContaining({ payload: { userId, hasBusinessAccess: true, version: expect.any(String) } }),
    ]);

    await prisma.$transaction((tx) => refresh.execute(userId, tx));
    expect(await messages(userId)).toHaveLength(1);
  });

  it('rolls back lifecycle changes and the outbox message together', async () => {
    const userId = nextUser();
    const current = await subscription(userId, 'ACTIVE', new Date(Date.now() - 86400000), new Date(Date.now() - 60000));
    const failure = new Error('fail after outbox insert');

    await expect(prisma.$transaction(async (tx) => {
      await refresh.execute(userId, tx);
      throw failure;
    })).rejects.toBe(failure);

    expect(await prisma.subscription.findUnique({ where: { id: current.id } })).toEqual(current);
    expect(await messages(userId)).toEqual([]);
  });

  it('records purchase and renewal snapshots with increasing versions and no payment replay duplicate', async () => {
    const userId = nextUser();
    const purchase = await payment(userId, PaymentType.PURCHASE, `sub_${randomUUID()}`);
    const created = await prisma.$transaction((tx) => apply.execute(new ApplySuccessfulPaymentCommand(purchase, tx)));
    const before = await messages(userId);
    expect(before).toHaveLength(1);
    expect(before[0].payload.hasBusinessAccess).toBe(true);

    await expect(prisma.$transaction((tx) => apply.execute(new ApplySuccessfulPaymentCommand(purchase, tx))))
      .resolves.toEqual(created);
    expect(await messages(userId)).toHaveLength(1);

    const renewal = await payment(userId, PaymentType.RENEWAL, purchase.providerSubscriptionId!);
    await prisma.$transaction((tx) => apply.execute(new ApplySuccessfulPaymentCommand(renewal, tx)));
    const after = await messages(userId);
    expect(after).toHaveLength(2);
    const versions = after.map((event) => BigInt(event.payload.version));
    expect(versions.filter((version) => version > BigInt(before[0].payload.version))).toHaveLength(1);
    expect(after.every((event) => event.payload.hasBusinessAccess)).toBe(true);
  });

  it('rechecks after a concurrent renewal holds the common user lock', async () => {
    const userId = nextUser();
    const current = await subscription(userId, 'ACTIVE', new Date(Date.now() - 86400000), new Date(Date.now() - 60000));
    const renewal = await payment(userId, PaymentType.RENEWAL, current.providerSubscriptionId!);
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { entered = resolve; });
    const paymentTransaction = prisma.$transaction(async (tx) => {
      await repository.lockByUserId(userId, tx);
      entered();
      await held;
      return apply.execute(new ApplySuccessfulPaymentCommand(renewal, tx));
    }, { timeout: 10000 });
    await Promise.race([locked, paymentTransaction]);
    const workerTransaction = prisma.$transaction((tx) => refresh.execute(userId, tx), { timeout: 10000 });
    release();
    await Promise.all([paymentTransaction, workerTransaction]);

    expect(await prisma.subscription.findUnique({ where: { id: current.id } })).toMatchObject({ status: 'ACTIVE' });
    const events = await messages(userId);
    expect(events).toHaveLength(1);
    expect(events[0].payload.hasBusinessAccess).toBe(true);
  });

  function nextUser(): number {
    const userId = randomInt(1_000_000_000, 2_000_000_000);
    users.push(userId);
    return userId;
  }

  function subscription(userId: number, status: 'ACTIVE' | 'PENDING', startsAt: Date, expiresAt: Date) {
    return prisma.subscription.create({
      data: {
        userId, planId, status, startsAt, expiresAt, provider: 'STRIPE',
        providerSubscriptionId: `sub_${randomUUID()}`, autoRenewalStatus: 'DISABLED',
      },
    });
  }

  async function payment(userId: number, type: PaymentType, providerSubscriptionId: string): Promise<SuccessfulPayment> {
    const paidAt = new Date();
    const stored = await prisma.payment.create({
      data: {
        userId, planId, type, amount: 1000, currency: 'USD', periodUnit: 'MONTH', periodCount: 1,
        providerType: 'STRIPE', providerSubscriptionId, autoRenewalRequested: true, status: 'SUCCEEDED', paidAt,
      },
    });
    return {
      paymentId: stored.id, userId, planId, type, amount: 1000, currency: Currency.USD,
      periodUnit: PeriodUnit.MONTH, periodCount: 1, provider: PaymentProvider.STRIPE,
      providerSubscriptionId, providerCustomerId: null, autoRenewalRequested: true, paidAt: paidAt.toISOString(),
    };
  }

  function messages(userId: number) {
    return prisma.$queryRaw<{ id: string; payload: AccessPayload }[]>`
      SELECT id, payload FROM nest_outbox.messages WHERE key = ${`business-access:${userId}`}
    `;
  }
});
