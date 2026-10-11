import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../database/prisma/generated/client.js';
import type { ProviderCheckout } from '../application/ports/payment-provider.js';
import {
  PaymentsRepository,
  type AttachCheckoutResult,
  type CreatePaymentResult,
} from '../application/ports/payments.repository.js';
import { CheckoutPurpose, Payment, PaymentStatus } from '../domain/payment.entity.js';
import { PaymentPrismaMapper } from './payment-prisma.mapper.js';

type ProviderReference = 'CHECKOUT' | 'PAYMENT' | 'SUBSCRIPTION' | 'INVOICE' | 'UNKNOWN';

const PROVIDER_REFERENCE_BY_FIELD: Readonly<Record<string, Exclude<ProviderReference, 'UNKNOWN'>>> = {
  providercheckoutid: 'CHECKOUT',
  providerpaymentid: 'PAYMENT',
  providersubscriptionid: 'SUBSCRIPTION',
  providerinvoiceid: 'INVOICE',
};

/**
 * Normalizes both the classic query-engine `meta.target` and Prisma 7
 * driver-adapter metadata. The latter is driver-specific, so unknown shapes
 * deliberately degrade to UNKNOWN instead of escaping into application code.
 */
export function classifyProviderReferenceConflict(meta: unknown): ProviderReference {
  const metadata = asRecord(meta);
  const target = metadata ? toStringArray(metadata.target) : [];
  const adapterError = asRecord(metadata?.driverAdapterError);
  const cause = asRecord(adapterError?.cause);
  const constraint = asRecord(cause?.constraint);
  const fields = target.length > 0 ? target : toStringArray(constraint?.fields);

  for (const field of fields) {
    const reference = PROVIDER_REFERENCE_BY_FIELD[normalizeIdentifier(field)];
    if (reference) return reference;
  }

  return 'UNKNOWN';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeIdentifier(value: string): string {
  return value.replaceAll('"', '').split('.').at(-1)!.replaceAll('_', '').toLowerCase();
}

@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(payment: Payment): Promise<CreatePaymentResult> {
    try {
      const row = await this.prisma.payment.create({
        data: {
          id: payment.id,
          userId: payment.userId,
          planId: payment.planId,
          amount: payment.amount,
          currency: payment.currency,
          periodCount: payment.periodCount,
          periodUnit: payment.periodUnit,
          providerType: payment.providerType,
          idempotentKey: payment.idempotentKey,
          type: payment.type,
          checkoutPurpose: payment.checkoutPurpose,
          autoRenewalRequested: payment.autoRenewalRequested,
          targetSubscriptionId: payment.targetSubscriptionId,
          providerCheckoutId: payment.providerCheckoutId,
          providerPaymentId: payment.providerPaymentId,
          providerSubscriptionId: payment.providerSubscriptionId,
          providerInvoiceId: payment.providerInvoiceId,
          providerCustomerId: payment.providerCustomerId,
          checkoutExpiresAt: payment.checkoutExpiresAt,
        },
      });
      return { outcome: 'CREATED', payment: PaymentPrismaMapper.toDomain(row) };
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;

      // Типизировать результат конфликта БД
      // Classify by persisted facts instead of leaking Prisma's provider-specific
      // `target`/constraint metadata into the application layer.
      const idempotent = await this.prisma.payment.findUnique({
        where: {
          userId_idempotentKey: { userId: payment.userId, idempotentKey: payment.idempotentKey },
        },
      });
      if (idempotent)
        return {
          outcome: 'IDEMPOTENCY_CONFLICT',
          payment: PaymentPrismaMapper.toDomain(idempotent),
        };

      if (payment.checkoutPurpose === CheckoutPurpose.INITIAL_SUBSCRIPTION) {
        const reservation = await this.prisma.payment.findFirst({
          where: {
            userId: payment.userId,
            checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
            OR: [
              { status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] } },
              { status: PaymentStatus.SUCCEEDED, subscriptionId: null },
            ],
          },
          orderBy: { createdAt: 'asc' },
        });
        if (reservation)
          return {
            outcome: 'INITIAL_RESERVATION_CONFLICT',
            payment: PaymentPrismaMapper.toDomain(reservation),
          };
      }

      // A P2002 not explained by a create-flow invariant is a schema/programming
      // error and must remain an infrastructure failure.
      throw error;
    }
  }

  async findByUserAndIdempotency(userId: number, idempotencyKey: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findUnique({
      where: { userId_idempotentKey: { userId, idempotentKey: idempotencyKey } },
    });
    return row ? PaymentPrismaMapper.toDomain(row) : null;
  }

  async findById(paymentId: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    return row ? PaymentPrismaMapper.toDomain(row) : null;
  }

  async attachCheckout(paymentId: string, checkout: ProviderCheckout): Promise<AttachCheckoutResult> {
    try {
      // атомарное обновление платежа защита для конкурентного attach без read/update TOCTOU
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.payment.updateMany({
          where: {
            id: paymentId,
            status: PaymentStatus.CREATED,
            providerCheckoutId: null,
          },
          data: {
            providerCheckoutId: checkout.checkoutId,
            providerPaymentId: checkout.providerPaymentId,
            providerSubscriptionId: checkout.providerSubscriptionId,
            providerInvoiceId: checkout.providerInvoiceId,
            checkoutExpiresAt: checkout.checkoutExpiresAt,
            providerCustomerId: checkout.providerCustomerId,
            providerSnapshot: checkout.snapshot as Prisma.InputJsonValue,
            status: PaymentStatus.PENDING,
          },
        });
        const row = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!row) return { outcome: 'PAYMENT_NOT_FOUND' };
        if (updated.count === 1) return { outcome: 'ATTACHED', payment: PaymentPrismaMapper.toDomain(row) };
        if (row.providerCheckoutId === checkout.checkoutId)
          return { outcome: 'ALREADY_ATTACHED', payment: PaymentPrismaMapper.toDomain(row) };
        if (row.providerCheckoutId !== null) return { outcome: 'CHECKOUT_CONFLICT' };
        return { outcome: 'INVALID_STATE' };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      // Collision по provider checkout/payment/subscription/invoice возвращает типизированный результат.
      return {
        outcome: 'PROVIDER_REFERENCE_CONFLICT',
        reference: classifyProviderReferenceConflict(error.meta),
      };
    }
  }

  async markStatus(paymentId: string, status: PaymentStatus): Promise<void> {
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status } });
  }

  private isUniqueConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
