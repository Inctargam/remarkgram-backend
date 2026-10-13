import { describe, expect, it, vi } from 'vitest';
import { classifyProviderReferenceConflict } from './prisma-payments.repository.js';
import { PrismaPaymentsRepository } from './prisma-payments.repository.js';
import type { PrismaService } from '../../../../../database/prisma.service.js';
import { Currency, PeriodUnit } from '../../../../plans/domain/plan.entity.js';
import {
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../domain/payment.entity.js';

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
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.confirmSuccessfulPayment(successCommand(), { payment: { updateMany } }),
    ).resolves.toEqual({ outcome: 'SUCCEEDED' });
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it('returns INVALID_TRANSITION when the conditional Prisma update changes no row', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = new PrismaPaymentsRepository({} as PrismaService);

    await expect(
      repository.confirmSuccessfulPayment(successCommand(), { payment: { updateMany } }),
    ).resolves.toEqual({ outcome: 'INVALID_TRANSITION' });
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
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty('status');
    expect(updateMany.mock.calls[0]?.[0].where).not.toHaveProperty('status');
    expect(JSON.stringify(updateMany.mock.calls[0]?.[0].where.AND)).not.toContain(
      'providerSubscriptionId',
    );
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty('providerSubscriptionId');
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty('providerInvoiceId');
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
    targetSubscriptionId: null,
    autoRenewalRequested: null,
    status: PaymentStatus.SUCCEEDED,
    createdAt: new Date('2026-10-13T12:00:00.000Z'),
    paidAt: new Date('2026-10-13T12:00:00.000Z'),
    checkoutExpiresAt: null,
    type: PaymentType.RENEWAL,
    checkoutPurpose: null,
  };
}
