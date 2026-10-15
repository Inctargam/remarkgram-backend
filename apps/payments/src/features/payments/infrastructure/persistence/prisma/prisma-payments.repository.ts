import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service.js';
import { Prisma } from '../../../../../database/prisma/generated/client.js';
import type { ProviderCheckout } from '../../../application/ports/payment-provider.js';
import type { PaymentsTransactionContext } from '../../../application/ports/payments-unit-of-work.js';
import {
  PaymentsRepository,
  type ApplyCheckoutCompletedCommand,
  type ApplyCheckoutCompletedUpdateResult,
  type AttachCheckoutResult,
  type BindPaymentProviderSubscriptionCommand,
  type BindPaymentProviderSubscriptionResult,
  type CancelPendingPaymentCommand,
  type CancelPendingPaymentUpdateResult,
  type ConfirmSuccessfulPaymentCommand,
  type ConfirmSuccessfulPaymentUpdateResult,
  type CreatePaymentResult,
  type CreateSuccessfulRenewalCommand,
  type CreateSuccessfulRenewalResult,
  type LinkPaymentSubscriptionCommand,
  type LinkPaymentSubscriptionResult,
} from '../../../application/ports/payments.repository.js';
import { CheckoutPurpose, Payment, PaymentStatus, PaymentType } from '../../../domain/payment.entity.js';
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

  async findById(paymentId: string, ctx?: PaymentsTransactionContext): Promise<Payment | null> {
    const client = ctx ? (ctx as Prisma.TransactionClient) : this.prisma;
    const row = await client.payment.findUnique({ where: { id: paymentId } });
    return row ? PaymentPrismaMapper.toDomain(row) : null;
  }

  async findByProviderPaymentId(
    provider: Payment['providerType'],
    providerPaymentId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    const client = ctx as Prisma.TransactionClient;
    const row = await client.payment.findFirst({
      where: { providerType: provider, providerPaymentId },
    });
    return row ? PaymentPrismaMapper.toDomain(row) : null;
  }

  async findByProviderCheckoutId(
    provider: Payment['providerType'],
    providerCheckoutId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    const client = ctx as Prisma.TransactionClient;
    const row = await client.payment.findFirst({
      where: { providerType: provider, providerCheckoutId },
    });
    return row ? PaymentPrismaMapper.toDomain(row) : null;
  }

  async findByProviderInvoiceId(
    provider: Payment['providerType'],
    providerInvoiceId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    const client = ctx as Prisma.TransactionClient;
    const row = await client.payment.findUnique({
      where: {
        providerType_providerInvoiceId: {
          providerType: provider,
          providerInvoiceId,
        },
      },
    });
    return row ? PaymentPrismaMapper.toDomain(row) : null;
  }

  async findByProviderSubscriptionId(
    provider: Payment['providerType'],
    providerSubscriptionId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    const client = ctx as Prisma.TransactionClient;
    const row = await client.payment.findFirst({
      where: { providerType: provider, providerSubscriptionId },
      orderBy: { createdAt: 'asc' },
    });
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

  async applyCheckoutCompleted(
    command: ApplyCheckoutCompletedCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<ApplyCheckoutCompletedUpdateResult> {
    const client = ctx as Prisma.TransactionClient;
    const providerReferences: Prisma.PaymentWhereInput[] = [];
    if (command.providerPaymentId !== undefined) {
      providerReferences.push(this.compatibleReference('providerPaymentId', command.providerPaymentId));
    }
    if (command.providerSubscriptionId !== undefined) {
      providerReferences.push(
        this.compatibleReference('providerSubscriptionId', command.providerSubscriptionId),
      );
    }
    const providerData: Prisma.PaymentUpdateManyMutationInput = {
      ...(command.providerPaymentId === undefined
        ? {}
        : { providerPaymentId: command.providerPaymentId ?? undefined }),
      ...(command.providerSubscriptionId === undefined
        ? {}
        : { providerSubscriptionId: command.providerSubscriptionId ?? undefined }),
    };
    try {
      const updated = await client.payment.updateMany({
        where: {
          id: command.paymentId,
          AND: [
            this.compatibleReference('providerCheckoutId', command.providerCheckoutId),
            this.compatibleReference('providerCustomerId', command.providerCustomerId),
            ...providerReferences,
          ],
        },
        data: {
          providerCheckoutId: command.providerCheckoutId,
          providerCustomerId: command.providerCustomerId ?? undefined,
          ...providerData,
        },
      });
      if (updated.count !== 1) return { outcome: 'REFERENCE_CONFLICT' };

      return { outcome: 'APPLIED' };
    } catch (error) {
      if (this.isUniqueConflict(error)) return { outcome: 'REFERENCE_CONFLICT' };
      throw error;
    }
  }

  async confirmSuccessfulPayment(
    command: ConfirmSuccessfulPaymentCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<ConfirmSuccessfulPaymentUpdateResult> {
    const client = ctx as Prisma.TransactionClient;

    try {
      const updated = await client.payment.updateMany({
        where: {
          id: command.paymentId,
          status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
          AND: [
            this.compatibleReference('providerPaymentId', command.providerPaymentId),
            this.compatibleReference('providerSubscriptionId', command.providerSubscriptionId),
            this.compatibleReference('providerInvoiceId', command.providerInvoiceId),
            this.compatibleReference('providerCustomerId', command.providerCustomerId),
          ],
        },
        data: {
          providerPaymentId: command.providerPaymentId ?? undefined,
          providerSubscriptionId: command.providerSubscriptionId ?? undefined,
          providerInvoiceId: command.providerInvoiceId ?? undefined,
          providerCustomerId: command.providerCustomerId ?? undefined,
          status: PaymentStatus.SUCCEEDED,
          paidAt: command.paidAt,
        },
      });
      if (updated.count !== 1) return { outcome: 'INVALID_TRANSITION' };

      const payment = await this.findById(command.paymentId, ctx);
      if (!payment) throw new Error(`Confirmed Payment ${command.paymentId} cannot be reloaded`);
      return { outcome: 'SUCCEEDED', payment };
    } catch (error) {
      if (this.isUniqueConflict(error)) return { outcome: 'REFERENCE_CONFLICT' };
      throw error;
    }
  }

  async cancelPendingPayment(
    command: CancelPendingPaymentCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<CancelPendingPaymentUpdateResult> {
    const client = ctx as Prisma.TransactionClient;
    try {
      const updated = await client.payment.updateMany({
        where: {
          id: command.paymentId,
          status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
          AND: [
            this.compatibleReference('providerCheckoutId', command.providerCheckoutId),
            this.compatibleReference('providerCustomerId', command.providerCustomerId),
          ],
        },
        data: {
          providerCheckoutId: command.providerCheckoutId,
          providerCustomerId: command.providerCustomerId ?? undefined,
          status: PaymentStatus.CANCELED,
        },
      });
      return updated.count === 1 ? { outcome: 'CANCELED' } : { outcome: 'INVALID_TRANSITION' };
    } catch (error) {
      if (this.isUniqueConflict(error)) return { outcome: 'REFERENCE_CONFLICT' };
      throw error;
    }
  }

  async linkSuccessfulPaymentToSubscription(
    command: LinkPaymentSubscriptionCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<LinkPaymentSubscriptionResult> {
    const client = ctx as Prisma.TransactionClient;
    const updated = await client.payment.updateMany({
      where: {
        id: command.paymentId,
        status: PaymentStatus.SUCCEEDED,
        OR: [{ subscriptionId: null }, { subscriptionId: command.subscriptionId }],
      },
      data: { subscriptionId: command.subscriptionId },
    });
    return updated.count === 1 ? { outcome: 'LINKED' } : { outcome: 'NOT_LINKED' };
  }

  async bindPaymentProviderSubscription(
    command: BindPaymentProviderSubscriptionCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<BindPaymentProviderSubscriptionResult> {
    const client = ctx as Prisma.TransactionClient;
    const updated = await client.payment.updateMany({
      where: {
        id: command.paymentId,
        status: PaymentStatus.SUCCEEDED,
        subscriptionId: command.subscriptionId,
        OR: [{ providerSubscriptionId: null }, { providerSubscriptionId: command.providerSubscriptionId }],
      },
      data: { providerSubscriptionId: command.providerSubscriptionId },
    });
    return updated.count === 1 ? { outcome: 'BOUND' } : { outcome: 'NOT_BOUND' };
  }

  async createSuccessfulRenewal(
    command: CreateSuccessfulRenewalCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<CreateSuccessfulRenewalResult> {
    const client = ctx as Prisma.TransactionClient;
    try {
      const row = await client.payment.upsert({
        where: {
          providerType_providerInvoiceId: {
            providerType: command.providerType,
            providerInvoiceId: command.providerInvoiceId,
          },
        },
        create: {
          userId: command.userId,
          planId: command.planId,
          amount: command.amount,
          currency: command.currency,
          periodCount: command.periodCount,
          periodUnit: command.periodUnit,
          providerType: command.providerType,
          providerPaymentId: command.providerPaymentId,
          providerSubscriptionId: command.providerSubscriptionId,
          providerInvoiceId: command.providerInvoiceId,
          providerCustomerId: command.providerCustomerId,
          subscriptionId: command.subscriptionId,
          status: PaymentStatus.SUCCEEDED,
          paidAt: command.paidAt,
          type: PaymentType.RENEWAL,
          checkoutPurpose: null,
          autoRenewalRequested: null,
          targetSubscriptionId: null,
        },
        update: {},
      });
      return { outcome: 'PERSISTED', payment: PaymentPrismaMapper.toDomain(row) };
    } catch (error) {
      if (this.isUniqueConflict(error)) return { outcome: 'REFERENCE_CONFLICT' };
      throw error;
    }
  }

  private compatibleReference(
    field:
      | 'providerCheckoutId'
      | 'providerPaymentId'
      | 'providerSubscriptionId'
      | 'providerInvoiceId'
      | 'providerCustomerId',
    incoming: string | null | undefined,
  ): Prisma.PaymentWhereInput {
    return incoming === null || incoming === undefined
      ? {}
      : { OR: [{ [field]: null }, { [field]: incoming }] };
  }

  async markStatus(paymentId: string, status: PaymentStatus): Promise<void> {
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status } });
  }

  private isUniqueConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2002') return true;
    if (error.code !== 'P2010') return false;
    const meta = asRecord(error.meta);
    return meta?.code === '23505';
  }
}
