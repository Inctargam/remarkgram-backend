import { Prisma } from '../../../../../database/prisma/generated/client.js';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../database/prisma.service.js';
import { Currency, PeriodUnit } from '../../../../plans/domain/plan.entity.js';
import {
  CheckoutPurpose,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../domain/payment.entity.js';
import { classifyProviderReferenceConflict, PrismaPaymentsRepository } from './prisma-payments.repository.js';

describe('classifyProviderReferenceConflict', () => {
  it.each([
    [['providerType', 'providerCheckoutId'], 'CHECKOUT'],
    [['provider_type', 'provider_payment_id'], 'PAYMENT'],
    [['provider_type', 'provider_subscription_id'], 'SUBSCRIPTION'],
    [['provider_type', 'provider_invoice_id'], 'INVOICE'],
  ] as const)('classifies classic meta.target %j as %s', (target, expected) => {
    expect(classifyProviderReferenceConflict({ target })).toBe(expected);
  });

  it.each([
    [['provider_type', 'provider_checkout_id'], 'CHECKOUT'],
    [['provider_type', 'provider_payment_id'], 'PAYMENT'],
    [['provider_type', 'provider_subscription_id'], 'SUBSCRIPTION'],
    [['provider_type', 'provider_invoice_id'], 'INVOICE'],
  ] as const)('classifies adapter-pg constraint fields %j as %s', (fields, expected) => {
    expect(
      classifyProviderReferenceConflict({
        driverAdapterError: { cause: { constraint: { fields } } },
      }),
    ).toBe(expected);
  });

  it.each([
    undefined,
    {},
    { target: ['user_id', 'idempotent_key'] },
    {
      driverAdapterError: {
        cause: { constraint: { index: 'payments_provider_type_provider_checkout_id_key' } },
      },
    },
  ])('returns UNKNOWN for unsupported metadata %#', (meta) => {
    expect(classifyProviderReferenceConflict(meta)).toBe('UNKNOWN');
  });
});

describe('PrismaPaymentsRepository.confirmSuccessfulPayment', () => {
  it('updates only persistence fields supplied by the application command', async () => {
    const updateManyAndReturn = vi.fn().mockResolvedValue([successfulPurchaseRow()]);
    const findUnique = vi.fn();
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.confirmSuccessfulPayment(successCommand(), { payment: { updateManyAndReturn, findUnique } }),
    ).resolves.toMatchObject({
      outcome: 'SUCCEEDED',
      payment: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: PaymentStatus.SUCCEEDED },
    });
    expect(updateManyAndReturn).toHaveBeenCalledOnce();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([successfulPurchaseRow(), null])('rereads the current Payment when no row changed: %j', async (row) => {
    const updateManyAndReturn = vi.fn().mockResolvedValue([]);
    const findUnique = vi.fn().mockResolvedValue(row);
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    const result = await repository.confirmSuccessfulPayment(successCommand(), {
      payment: { updateManyAndReturn, findUnique },
    });

    expect(result).toMatchObject({
      outcome: 'NOT_UPDATED',
      payment: row ? { id: row.id, status: row.status, paidAt: row.paidAt } : null,
    });
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: successCommand().paymentId } });
    expect(updateManyAndReturn).toHaveBeenCalledOnce();
  });

  it('preserves stored references when incoming references are absent', async () => {
    const row = successfulPurchaseRow();
    const updateManyAndReturn = vi.fn().mockResolvedValue([row]);
    const repository = new PrismaPaymentsRepository({} as PrismaService);
    await repository.confirmSuccessfulPayment({
      paymentId: row.id,
      paidAt: row.paidAt!,
      providerPaymentId: null,
      providerCustomerId: null,
    }, { payment: { updateManyAndReturn } });

    expect(updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{}, {}, {}, {}] }),
      data: expect.objectContaining({
        providerPaymentId: undefined,
        providerSubscriptionId: undefined,
        providerInvoiceId: undefined,
        providerCustomerId: undefined,
      }),
    }));
  });

  it('returns a reference conflict on uniqueness violation without reading the aborted transaction', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Reference already bound', {
      code: 'P2002', clientVersion: 'test',
    });
    const updateManyAndReturn = vi.fn().mockRejectedValue(error);
    const findUnique = vi.fn();
    const repository = new PrismaPaymentsRepository({} as PrismaService);
    await expect(repository.confirmSuccessfulPayment(successCommand(), {
      payment: { updateManyAndReturn, findUnique },
    })).resolves.toEqual({ outcome: 'REFERENCE_CONFLICT' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('propagates infrastructure errors without rereading in the failed transaction', async () => {
    const error = new Error('database unavailable');
    const updateManyAndReturn = vi.fn().mockRejectedValue(error);
    const findUnique = vi.fn();
    const repository = new PrismaPaymentsRepository({} as PrismaService);
    await expect(repository.confirmSuccessfulPayment(successCommand(), {
      payment: { updateManyAndReturn, findUnique },
    })).rejects.toBe(error);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('PrismaPaymentsRepository.applyCheckoutCompleted', () => {
  it('updates compatible references with one Prisma client call without changing lifecycle status', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.applyCheckoutCompleted(checkoutCommand(), { payment: { updateMany } }),
    ).resolves.toEqual({ outcome: 'APPLIED' });
    expect(updateMany).toHaveBeenCalledOnce();
    const update = updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      where: Record<string, unknown> & { AND?: unknown };
    };
    expect(update.data).not.toHaveProperty('status');
    expect(update.where).not.toHaveProperty('status');
    expect(JSON.stringify(update.where.AND)).not.toContain('providerSubscriptionId');
    expect(update.data).not.toHaveProperty('providerSubscriptionId');
    expect(update.data).not.toHaveProperty('providerInvoiceId');
  });

  it('reports a concurrent reference mismatch when the guarded update changes no row', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.applyCheckoutCompleted(checkoutCommand(), { payment: { updateMany } }),
    ).resolves.toEqual({ outcome: 'REFERENCE_CONFLICT' });
    expect(updateMany).toHaveBeenCalledOnce();
  });
});

describe('PrismaPaymentsRepository.cancelPendingPayment', () => {
  it('atomically cancels only a compatible non-terminal payment', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.cancelPendingPayment(
        {
          paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          providerCheckoutId: 'cs_expired',
          providerCustomerId: 'cus_test',
        },
        { payment: { updateMany } },
      ),
    ).resolves.toEqual({ outcome: 'CANCELED' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: PaymentStatus.CANCELED }),
      }),
    );
  });

  it('can reconcile and persist cancellation by PaymentIntent ID', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await repository.cancelPendingPayment(
      {
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        providerPaymentId: 'pi_canceled',
        providerCustomerId: 'cus_test',
      },
      { payment: { updateMany } },
    );

    expect(updateMany).toHaveBeenCalledOnce();
    const update = updateMany.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(update.data).toMatchObject({
      providerPaymentId: 'pi_canceled',
      status: PaymentStatus.CANCELED,
    });
  });

  it('can reconcile and persist cancellation by Invoice ID', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await repository.cancelPendingPayment(
      {
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        providerInvoiceId: 'in_voided',
        providerCustomerId: 'cus_test',
      },
      { payment: { updateMany } },
    );

    const update = updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      where: { AND: unknown[] };
    };
    expect(update.data).toMatchObject({
      providerInvoiceId: 'in_voided',
      status: PaymentStatus.CANCELED,
    });
    expect(JSON.stringify(update.where.AND)).toContain('providerInvoiceId');
  });

  it('reports a concurrent status or reference change without mutating another state', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(repository.cancelPendingPayment(
      {
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        providerInvoiceId: 'in_voided',
      },
      { payment: { updateMany } },
    )).resolves.toEqual({ outcome: 'INVALID_TRANSITION' });
  });
});

describe('PrismaPaymentsRepository.linkSuccessfulPaymentToSubscription', () => {
  it('links a successful unbound payment and permits an idempotent replay', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.linkSuccessfulPaymentToSubscription(
        {
          paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        },
        { payment: { updateMany } },
      ),
    ).resolves.toEqual({ outcome: 'LINKED' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          status: PaymentStatus.SUCCEEDED,
          OR: [{ subscriptionId: null }, { subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
        }),
        data: { subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
      }),
    );
  });

  it('не перезаписывает subscription-A значением subscription-B при повторном или конкурентном handler', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.linkSuccessfulPaymentToSubscription(
        {
          paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          subscriptionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        },
        { payment: { updateMany } },
      ),
    ).resolves.toEqual({ outcome: 'NOT_LINKED' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          OR: [{ subscriptionId: null }, { subscriptionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }],
        }),
      }),
    );
  });
});

describe('PrismaPaymentsRepository.bindPaymentProviderSubscription', () => {
  it('атомарно сохраняет новый provider ID и разрешает replay с тем же ID', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.bindPaymentProviderSubscription(
        {
          paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          providerSubscriptionId: 'sub_new',
        },
        { payment: { updateMany } },
      ),
    ).resolves.toEqual({ outcome: 'BOUND' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          OR: [{ providerSubscriptionId: null }, { providerSubscriptionId: 'sub_new' }],
        }),
        data: { providerSubscriptionId: 'sub_new' },
      }),
    );
  });
});

describe('PrismaPaymentsRepository.createSuccessfulRenewal', () => {
  it('upserts by provider Invoice without changing an existing renewal', async () => {
    const upsert = vi.fn().mockResolvedValue(renewalRow());
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.createSuccessfulRenewal(renewalCommand(), { payment: { upsert } }),
    ).resolves.toMatchObject({ outcome: 'PERSISTED' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerType_providerInvoiceId: {
            providerType: PaymentProvider.STRIPE,
            providerInvoiceId: 'in_renewal',
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: expect.objectContaining({
          type: PaymentType.RENEWAL,
          status: PaymentStatus.SUCCEEDED,
          paidAt: new Date('2026-10-13T12:00:00.000Z'),
          subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        }),
        update: {},
      }),
    );
  });
});

function checkoutCommand() {
  return {
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    providerCheckoutId: 'cs_test',
    providerPaymentId: 'pi_test',
    providerCustomerId: 'cus_test',
  };
}

function successCommand() {
  return {
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    paidAt: new Date('2026-10-12T12:00:00.000Z'),
    providerPaymentId: 'pi_test',
    providerSubscriptionId: null,
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
  };
}

function renewalCommand() {
  return {
    userId: 42,
    planId: 7,
    amount: 10_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    providerPaymentId: 'pi_renewal',
    providerSubscriptionId: 'sub_test',
    providerInvoiceId: 'in_renewal',
    providerCustomerId: 'cus_test',
    subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    paidAt: new Date('2026-10-13T12:00:00.000Z'),
  };
}

function renewalRow() {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: 42,
    planId: 7,
    amount: 10_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerCheckoutId: null,
    providerPaymentId: 'pi_renewal',
    providerSubscriptionId: 'sub_test',
    providerInvoiceId: 'in_renewal',
    providerCustomerId: 'cus_test',
    providerType: PaymentProvider.STRIPE,
    providerSnapshot: null,
    idempotentKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    autoRenewalRequested: null,
    status: PaymentStatus.SUCCEEDED,
    createdAt: new Date('2026-10-13T12:00:00.000Z'),
    paidAt: new Date('2026-10-13T12:00:00.000Z'),
    checkoutExpiresAt: null,
    type: PaymentType.RENEWAL,
    checkoutPurpose: null,
  };
}

function successfulPurchaseRow() {
  return {
    ...renewalRow(),
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    providerCheckoutId: 'cs_test',
    providerPaymentId: 'pi_test',
    providerSubscriptionId: null,
    providerInvoiceId: null,
    idempotentKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    subscriptionId: null,
    autoRenewalRequested: true,
    paidAt: new Date('2026-10-12T12:00:00.000Z'),
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
  };
}


describe('PrismaPaymentsRepository.ensurePendingRenewal', () => {
  it('creates PENDING without changing the existing invoice on duplicate or late delivery', async () => {
    const upsert = vi.fn().mockResolvedValue(renewalRow());
    const repository = new PrismaPaymentsRepository({} as PrismaService);
    const { paidAt: _paidAt, providerPaymentId: _providerPaymentId, ...context } = renewalCommand();
    await repository.ensurePendingRenewal(context, { payment: { upsert } });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { providerType_providerInvoiceId: { providerType: context.providerType, providerInvoiceId: context.providerInvoiceId } },
      create: expect.objectContaining({ status: PaymentStatus.PENDING, paidAt: null, providerPaymentId: null, type: PaymentType.RENEWAL }),
      update: {},
    }));
  });
});
