import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/database/prisma/generated/client.js';
import { PrismaPaymentsRepository } from '../../src/features/payments/infrastructure/persistence/prisma/prisma-payments.repository.js';
import {
  CheckoutPurpose,
  Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../src/features/payments/domain/payment.entity.js';
import { Currency, PeriodUnit } from '../../src/features/plans/domain/plan.entity.js';

const databaseUrl = process.env.PAYMENTS_INTEGRATION_DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));

integration('PrismaPaymentsRepository atomicity (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: PrismaPaymentsRepository;
  let planId: number;
  const users: number[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    await prisma.$connect();
    const plan = await prisma.plan.create({
      data: { price: 1_000, currency: 'USD', periodCount: 1, periodUnit: 'MONTH' },
    });
    planId = plan.id;
    repository = new PrismaPaymentsRepository(prisma as never);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.payment.deleteMany({ where: { userId: { in: users } } });
    if (planId) await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('classifies two identical concurrent creates as created plus idempotency conflict', async () => {
    const userId = nextUser();
    const key = randomUUID();
    const [left, right] = await Promise.all([
      repository.create(initialPayment(userId, key)),
      repository.create(initialPayment(userId, key)),
    ]);

    expect([left.outcome, right.outcome].sort()).toEqual(['CREATED', 'IDEMPOTENCY_CONFLICT']);
    expect(left.payment.id).toBe(right.payment.id);
    await expect(prisma.payment.count({ where: { userId } })).resolves.toBe(1);
  });

  it('keeps one initial reservation for two concurrent distinct keys', async () => {
    const userId = nextUser();
    const [left, right] = await Promise.all([
      repository.create(initialPayment(userId, randomUUID())),
      repository.create(initialPayment(userId, randomUUID())),
    ]);

    expect([left.outcome, right.outcome].sort()).toEqual(['CREATED', 'INITIAL_RESERVATION_CONFLICT']);
    await expect(prisma.payment.count({ where: { userId } })).resolves.toBe(1);
  });

  it('holds the initial reservation for SUCCEEDED without subscriptionId', async () => {
    const userId = nextUser();
    const first = await repository.create(initialPayment(userId, randomUUID()));
    expect(first.outcome).toBe('CREATED');
    await prisma.payment.update({
      where: { id: first.payment.id },
      data: { status: PaymentStatus.SUCCEEDED, paidAt: new Date(), subscriptionId: null },
    });

    const second = await repository.create(initialPayment(userId, randomUUID()));
    expect(second.outcome).toBe('INITIAL_RESERVATION_CONFLICT');
  });

  it('attaches CREATED to PENDING and repeats the same checkout as a no-op', async () => {
    const payment = await createdExtension(nextUser());
    const first = await repository.attachCheckout(payment.id, checkout('cs_same'));
    const repeated = await repository.attachCheckout(payment.id, checkout('cs_same'));

    expect(first.outcome).toBe('ATTACHED');
    expect(repeated.outcome).toBe('ALREADY_ATTACHED');
    if (repeated.outcome === 'ALREADY_ATTACHED') {
      expect(repeated.payment.status).toBe(PaymentStatus.PENDING);
      expect(repeated.payment.providerCheckoutId).toBe('cs_same');
    }
  });

  it('rejects a different checkout without overwriting provider correlation', async () => {
    const payment = await createdExtension(nextUser());
    await repository.attachCheckout(payment.id, checkout('cs_original'));
    const conflict = await repository.attachCheckout(payment.id, checkout('cs_other'));

    expect(conflict.outcome).toBe('CHECKOUT_CONFLICT');
    await expect(prisma.payment.findUnique({ where: { id: payment.id } })).resolves.toMatchObject({
      providerCheckoutId: 'cs_original',
    });
  });

  it('serializes concurrent attach attempts without a lost update', async () => {
    const payment = await createdExtension(nextUser());
    const results = await Promise.all([
      repository.attachCheckout(payment.id, checkout('cs_left')),
      repository.attachCheckout(payment.id, checkout('cs_right')),
    ]);

    expect(results.filter(({ outcome }) => outcome === 'ATTACHED')).toHaveLength(1);
    expect(results.filter(({ outcome }) => outcome === 'CHECKOUT_CONFLICT')).toHaveLength(1);
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(['cs_left', 'cs_right']).toContain(stored.providerCheckoutId);
  });

  it('classifies provider checkout uniqueness collisions', async () => {
    const first = await createdExtension(nextUser());
    const second = await createdExtension(nextUser());
    await repository.attachCheckout(first.id, checkout('cs_collision'));

    const collision = await repository.attachCheckout(second.id, checkout('cs_collision'));
    expect(collision).toEqual({ outcome: 'PROVIDER_REFERENCE_CONFLICT', reference: 'CHECKOUT' });
    await expect(prisma.payment.findUnique({ where: { id: second.id } })).resolves.toMatchObject({
      status: PaymentStatus.CREATED,
      providerCheckoutId: null,
    });
  });

  it('creates only one successful renewal for concurrent deliveries of the same Invoice', async () => {
    const userId = nextUser();
    const localSubscriptionId = randomUUID();
    const command = {
      userId,
      planId,
      amount: 1_000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.MONTH,
      providerType: PaymentProvider.STRIPE,
      providerPaymentId: `pi_${randomUUID()}`,
      providerSubscriptionId: `sub_${randomUUID()}`,
      providerInvoiceId: `in_${randomUUID()}`,
      providerCustomerId: `cus_${randomUUID()}`,
      subscriptionId: localSubscriptionId,
      paidAt: new Date('2026-10-13T12:00:00.000Z'),
    };

    const [left, right] = await Promise.all([
      repository.createSuccessfulRenewal(command, prisma as never),
      repository.createSuccessfulRenewal(command, prisma as never),
    ]);

    expect(left.outcome).toBe('PERSISTED');
    expect(right.outcome).toBe('PERSISTED');
    await expect(
      prisma.payment.count({
        where: {
          providerType: command.providerType,
          providerInvoiceId: command.providerInvoiceId,
          type: PaymentType.RENEWAL,
        },
      }),
    ).resolves.toBe(1);
  });

  function nextUser(): number {
    const userId = 1_500_000_000 + users.length + Math.floor(Math.random() * 100_000_000);
    users.push(userId);
    return userId;
  }

  async function createdExtension(userId: number): Promise<Payment> {
    const result = await repository.create(extensionPayment(userId, randomUUID()));
    expect(result.outcome).toBe('CREATED');
    return result.payment;
  }

  function initialPayment(userId: number, idempotentKey: string): Payment {
    return payment(userId, idempotentKey, CheckoutPurpose.INITIAL_SUBSCRIPTION, null);
  }

  function extensionPayment(userId: number, idempotentKey: string): Payment {
    return payment(userId, idempotentKey, CheckoutPurpose.SUBSCRIPTION_EXTENSION, randomUUID());
  }

  function payment(
    userId: number,
    idempotentKey: string,
    checkoutPurpose: CheckoutPurpose,
    targetSubscriptionId: string | null,
  ): Payment {
    return Payment.create({
      userId,
      planId,
      amount: 1_000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.MONTH,
      providerType: PaymentProvider.STRIPE,
      idempotentKey,
      checkoutPurpose,
      autoRenewalRequested: true,
      targetSubscriptionId,
    });
  }
});

function checkout(checkoutId: string) {
  return {
    checkoutId,
    checkoutUrl: `https://checkout.stripe.test/${checkoutId}`,
    providerPaymentId: null,
    providerSubscriptionId: null,
    providerInvoiceId: null,
    providerCustomerId: 'cus_atomicity',
    checkoutExpiresAt: new Date('2030-01-01T00:00:00Z'),
    snapshot: { checkoutId },
  };
}
