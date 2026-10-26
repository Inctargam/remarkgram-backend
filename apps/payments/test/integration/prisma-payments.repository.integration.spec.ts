import { ConfirmRenewalPaymentUseCase } from '../../src/features/payments/application/use-cases/payment-events/confirm-renewal-payment/confirm-renewal-payment.use-case.js';
import { ConfirmPaymentIntentSucceededUseCase } from '../../src/features/payments/application/use-cases/payment-events/confirm-payment-intent-succeeded/confirm-payment-intent-succeeded.use-case.js';
import type { PaymentIntentSucceededEvent } from '../../src/features/payments/application/events/payment-event.js';
import { paymentEventResult } from '../../src/features/payments/application/use-cases/payment-events/payment-event-result.js';
import { EnsureRenewalPaymentUseCase } from '../../src/features/payments/application/use-cases/payment-events/ensure-renewal-payment/ensure-renewal-payment.use-case.js';
import { ConfirmInvoicePaidUseCase } from '../../src/features/payments/application/use-cases/payment-events/confirm-invoice-paid/confirm-invoice-paid.use-case.js';
import { PaymentEventKind } from '../../src/features/payments/domain/payment-event-kind.js';
import type {
  InvoiceFinalizedEvent,
  InvoicePaidEvent,
} from '../../src/features/payments/application/events/payment-event.js';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

  it('serializes finalized/paid deliveries into one successful renewal and tolerates late finalized', async () => {
    const userId = nextUser();
    const source = await repository.create(initialPayment(userId, randomUUID()));
    const providerSubscriptionId = `sub_${randomUUID()}`;
    const providerInvoiceId = `in_${randomUUID()}`;
    const subscriptionId = randomUUID();
    await prisma.payment.update({
      where: { id: source.payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date(),
        subscriptionId,
        providerSubscriptionId,
      },
    });
    const finalized: InvoiceFinalizedEvent = {
      kind: PaymentEventKind.INVOICE_FINALIZED,
      provider: PaymentProvider.STRIPE,
      providerEventId: `evt_${randomUUID()}`,
      providerEventType: 'invoice.finalized',
      providerCreatedAt: new Date(),
      paymentId: null,
      payload: {
        providerInvoiceId,
        providerSubscriptionId,
        sourcePaymentId: source.payment.id,
        sourceSubscriptionId: subscriptionId,
        customerId: null,
        billingReason: 'subscription_cycle',
        amount: source.payment.amount + 250,
        currency: source.payment.currency,
      },
    };
    const paid: InvoicePaidEvent = {
      ...finalized,
      kind: PaymentEventKind.INVOICE_PAID,
      providerEventType: 'invoice.paid',
      providerEventId: `evt_${randomUUID()}`,
      payload: { ...finalized.payload, id: providerInvoiceId, providerPaymentId: null, paidAt: new Date() },
    };
    const ensure = new EnsureRenewalPaymentUseCase(repository);
    const confirm = new ConfirmInvoicePaidUseCase(repository, new ConfirmRenewalPaymentUseCase(repository));
    await Promise.all([
      prisma.$transaction((tx) => ensure.execute(finalized, tx)),
      prisma.$transaction((tx) => confirm.execute(paid, tx)),
    ]);
    await prisma.$transaction((tx) => ensure.execute(finalized, tx));
    const rows = await prisma.payment.findMany({
      where: { providerType: PaymentProvider.STRIPE, providerInvoiceId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: PaymentType.RENEWAL, status: PaymentStatus.SUCCEEDED,
      amount: source.payment.amount + 250, subscriptionId,
      userId: source.payment.userId, planId: source.payment.planId,
    });
    expect(rows[0]!.paidAt).not.toBeNull();
  });

  it('creates one renewal from the metadata source for concurrent paid events without finalized', async () => {
    const source = await createdExtension(nextUser());
    const subscriptionId = randomUUID();
    const providerSubscriptionId = `sub_${randomUUID()}`;
    const providerInvoiceId = `in_${randomUUID()}`;
    await prisma.payment.update({ where: { id: source.id }, data: {
      status: PaymentStatus.SUCCEEDED, paidAt: new Date(), subscriptionId, providerSubscriptionId,
    } });
    const event: InvoicePaidEvent = {
      kind: PaymentEventKind.INVOICE_PAID, provider: PaymentProvider.STRIPE,
      providerEventId: `evt_${randomUUID()}`, providerEventType: 'invoice.paid',
      providerCreatedAt: new Date(), paymentId: null,
      payload: {
        id: providerInvoiceId, providerInvoiceId, providerSubscriptionId,
        sourcePaymentId: source.id, sourceSubscriptionId: subscriptionId,
        customerId: null, providerPaymentId: `pi_${randomUUID()}`,
        billingReason: 'subscription_cycle', amount: source.amount + 400,
        currency: source.currency, paidAt: new Date('2026-10-13T12:00:00Z'),
      },
    };
    const lookup = repository.findByProviderInvoiceId.bind(repository);
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const find = vi.spyOn(repository, 'findByProviderInvoiceId').mockImplementation(async (...args) => {
      const payment = await lookup(...args);
      arrivals += 1;
      if (arrivals === 2) release();
      await ready;
      return payment;
    });
    const useCase = new ConfirmRenewalPaymentUseCase(repository);
    try {
      const results = await Promise.all([
        prisma.$transaction((tx) => useCase.execute(event, tx)),
        prisma.$transaction((tx) => useCase.execute({ ...event, providerEventId: `evt_${randomUUID()}` }, tx)),
      ]);
      const rows = await prisma.payment.findMany({ where: { providerInvoiceId, providerType: event.provider } });
      expect(rows).toHaveLength(1);
      const stored = await repository.findById(rows[0]!.id);
      const expected = paymentEventResult.successfulPayment(stored!);
      expect(results).toEqual([expected, expected]);
      expect(stored).toMatchObject({
        amount: source.amount + 400, planId: source.planId, userId: source.userId,
        periodCount: source.periodCount, periodUnit: source.periodUnit, subscriptionId,
        status: PaymentStatus.SUCCEEDED,
      });
      expect(find).toHaveBeenCalledTimes(2);
      await expect(repository.findById(source.id)).resolves.toMatchObject({ amount: source.amount });
    } finally {
      find.mockRestore();
    }
  });

  it('returns business success to both concurrent confirmations and preserves the winning paidAt', async () => {
    const payment = await createdExtension(nextUser());
    const event: PaymentIntentSucceededEvent = {
      kind: PaymentEventKind.PAYMENT_INTENT_SUCCEEDED,
      provider: PaymentProvider.STRIPE,
      providerEventId: `evt_${randomUUID()}`,
      providerEventType: 'payment_intent.succeeded',
      providerCreatedAt: new Date(),
      paymentId: payment.id,
      payload: {
        id: `pi_${randomUUID()}`,
        customerId: null,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: new Date('2026-10-13T12:00:00.000Z'),
      },
    };
    const concurrentEvent: PaymentIntentSucceededEvent = {
      ...event,
      providerEventId: `evt_${randomUUID()}`,
      payload: { ...event.payload, paidAt: new Date('2026-10-13T12:01:00.000Z') },
    };
    // Both use cases must read CREATED before either starts its conditional UPDATE.
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const confirm = repository.confirmSuccessfulPayment.bind(repository);
    const confirmation = vi.spyOn(repository, 'confirmSuccessfulPayment').mockImplementation(async (command, ctx) => {
      arrivals += 1;
      if (arrivals === 2) release();
      await ready;
      return confirm(command, ctx);
    });
    const useCase = new ConfirmPaymentIntentSucceededUseCase(repository);
    try {
      const results = await Promise.all([
        prisma.$transaction((tx) => useCase.execute(event, tx)),
        prisma.$transaction((tx) => useCase.execute(concurrentEvent, tx)),
      ]);
      const stored = await repository.findById(payment.id);
      expect(stored).not.toBeNull();
      const expected = paymentEventResult.successfulPayment(stored!);
      expect(results).toEqual([expected, expected]);
      const updates = await Promise.all(confirmation.mock.results.map(({ value }) => value));
      expect(updates.map(({ outcome }) => outcome).sort()).toEqual(['NOT_UPDATED', 'SUCCEEDED']);
      expect([event.payload.paidAt.getTime(), concurrentEvent.payload.paidAt.getTime()])
        .toContain(stored!.paidAt!.getTime());
      expect(stored!.providerPaymentId).toBe(event.payload.id);
    } finally {
      confirmation.mockRestore();
    }
  });

  it('keeps the same pending renewal for concurrent ensures', async () => {
    const params = {
      userId: nextUser(),
      planId,
      amount: 1000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.MONTH,
      providerType: PaymentProvider.STRIPE,
      providerInvoiceId: `in_${randomUUID()}`,
      providerSubscriptionId: `sub_${randomUUID()}`,
      providerCustomerId: null,
      subscriptionId: randomUUID(),
    };
    const [left, right] = await Promise.all([
      prisma.$transaction((tx) => repository.ensurePendingRenewal(params, tx)),
      prisma.$transaction((tx) => repository.ensurePendingRenewal(params, tx)),
    ]);
    expect(left.id).toBe(right.id);
    expect(left.status).toBe(PaymentStatus.PENDING);
    expect(right.paidAt).toBeNull();
    expect(right.providerPaymentId).toBeNull();
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
    return payment(userId, idempotentKey, CheckoutPurpose.INITIAL_SUBSCRIPTION);
  }

  function extensionPayment(userId: number, idempotentKey: string): Payment {
    return payment(userId, idempotentKey, CheckoutPurpose.SUBSCRIPTION_EXTENSION);
  }

  function payment(userId: number, idempotentKey: string, checkoutPurpose: CheckoutPurpose): Payment {
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
