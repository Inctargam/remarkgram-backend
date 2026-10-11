import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../database/prisma/generated/client.js';
import type { ProviderCheckout, VerifiedProviderEvent } from '../application/ports/payment-provider.js';
import {
  PaymentsRepository,
  type AttachCheckoutResult,
  type CreatePaymentResult,
  type WebhookProcessingResult,
} from '../application/ports/payments.repository.js';
import { InvalidSubscriptionPaymentResultError } from '../application/ports/subscription-payment-handler.js';
import {
  CheckoutPurpose,
  Payment,
  PaymentApplicationStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../domain/payment.entity.js';
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

  async receiveProviderEvent(event: VerifiedProviderEvent): Promise<'RECEIVED' | 'DUPLICATE'> {
    try {
      await this.prisma.paymentWebhook.create({
        data: {
          providerType: PaymentProvider.STRIPE,
          providerEventId: event.eventId,
          eventType: event.eventType,
          providerCreatedAt: event.providerCreatedAt,
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
        },
      });
      return 'RECEIVED';
    } catch (error) {
      if (this.isUniqueConflict(error)) return 'DUPLICATE';
      throw error;
    }
  }

  async claimProviderEvents(limit: number, leaseMs: number): Promise<VerifiedProviderEvent[]> {
    await this.prisma.paymentWebhook.updateMany({
      where: {
        processingStatus: 'PROCESSING',
        leaseUntil: { lt: new Date() },
        processingAttempts: { gte: 10 },
      },
      data: {
        processingStatus: 'DEAD',
        processingErrorCode: 'MAX_ATTEMPTS_EXCEEDED',
        processingError: 'Processing lease expired after the maximum number of attempts',
        leaseUntil: null,
      },
    });
    const seconds = Math.ceil(leaseMs / 1000);
    const rows = await this.prisma.$queryRaw<Array<{ payload: Prisma.JsonValue }>>(Prisma.sql`
      WITH claimed AS (SELECT id FROM payment_webhooks
        WHERE (((processing_status IN ('RECEIVED','ERROR')) AND available_at <= now())
          OR (processing_status='PROCESSING' AND lease_until < now()))
          AND processing_attempts < 10 ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT ${limit})
      UPDATE payment_webhooks w SET processing_status='PROCESSING', processing_attempts=w.processing_attempts+1,
        processing_started_at=now(), lease_until=now()+(${seconds}*interval '1 second')
      FROM claimed WHERE w.id=claimed.id RETURNING w.payload`);
    return rows.map((row) => row.payload as unknown as VerifiedProviderEvent);
  }

  async markProviderEventError(eventId: string, code: string, message: string): Promise<void> {
    const row = await this.prisma.paymentWebhook.findUnique({
      where: {
        providerType_providerEventId: { providerType: PaymentProvider.STRIPE, providerEventId: eventId },
      },
    });
    if (!row) return;
    const dead = row.processingAttempts >= 10;
    const delay = Math.min(900, 10 * 2 ** Math.max(0, row.processingAttempts - 1));
    await this.prisma.paymentWebhook.update({
      where: { id: row.id },
      data: {
        processingStatus: dead ? 'DEAD' : 'ERROR',
        processingErrorCode: code,
        processingError: message.slice(0, 2000),
        availableAt: new Date(Date.now() + delay * 1000),
        leaseUntil: null,
      },
    });
  }

  async applySuccessfulPayment(
    paymentId: string,
    apply: (
      payment: Payment,
      tx: unknown,
    ) => Promise<{ subscriptionId: string; action: 'CREATED' | 'SCHEDULED' | 'RENEWED' }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM payments WHERE id=${paymentId}::uuid FOR UPDATE`,
      );
      if (!locked.length) return { outcome: 'NOT_FOUND' as const };
      const row = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const payment = PaymentPrismaMapper.toDomain(row);
      if (row.status.toString() !== 'SUCCEEDED') return { outcome: 'NOT_SUCCEEDED' as const };
      if (row.applicationStatus.toString() === 'APPLIED' && row.subscriptionId)
        return { outcome: 'ALREADY_APPLIED' as const, payment };
      await tx.payment.update({
        where: { id: paymentId },
        data: { applicationStatus: 'APPLYING' },
      });
      const result = await apply(payment, tx);
      if (!this.isUuid(result.subscriptionId)) throw new InvalidSubscriptionPaymentResultError();
      const expected =
        payment.type === PaymentType.RENEWAL
          ? 'RENEWED'
          : payment.checkoutPurpose === CheckoutPurpose.INITIAL_SUBSCRIPTION
            ? 'CREATED'
            : 'SCHEDULED';
      if (result.action !== expected) throw new InvalidSubscriptionPaymentResultError();
      const saved = await tx.payment.update({
        where: { id: paymentId },
        data: {
          subscriptionId: result.subscriptionId,
          applicationStatus: 'APPLIED',
          applicationLeaseUntil: null,
          applicationErrorCode: null,
          applicationError: null,
        },
      });
      return {
        outcome: 'APPLIED' as const,
        payment: PaymentPrismaMapper.toDomain(saved),
        action: result.action,
      };
    });
  }

  async claimApplicationPayments(limit: number, leaseMs: number): Promise<string[]> {
    await this.prisma.payment.updateMany({
      where: {
        applicationStatus: 'APPLYING',
        applicationLeaseUntil: { lt: new Date() },
        applicationAttempts: { gte: 10 },
      },
      data: {
        applicationStatus: 'ERROR',
        applicationErrorCode: 'MAX_ATTEMPTS_EXCEEDED',
        applicationError: 'Application lease expired after the maximum number of attempts',
        applicationLeaseUntil: null,
        applicationAvailableAt: null,
      },
    });
    const seconds = Math.ceil(leaseMs / 1000);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH claimed AS (SELECT id FROM payments WHERE status='SUCCEEDED'
        AND application_attempts < 10
        AND (((application_status IN ('PENDING','ERROR'))
          AND (application_available_at IS NULL OR application_available_at <= now())
          AND (application_lease_until IS NULL OR application_lease_until < now()))
          OR (application_status='APPLYING' AND application_lease_until < now()))
        ORDER BY paid_at FOR UPDATE SKIP LOCKED LIMIT ${limit})
      UPDATE payments p SET application_status='APPLYING', application_attempts=p.application_attempts+1,
        application_lease_until=now()+(${seconds}*interval '1 second') FROM claimed
      WHERE p.id=claimed.id RETURNING p.id`);
    return rows.map((row) => row.id);
  }

  async markApplicationError(paymentId: string, code: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return;
    const delay = Math.min(900, 10 * 2 ** Math.max(0, payment.applicationAttempts - 1));
    await this.prisma.payment.updateMany({
      where: { id: paymentId, applicationStatus: { not: 'APPLIED' } },
      data: {
        applicationStatus: 'ERROR',
        applicationErrorCode: code,
        applicationError: code,
        applicationLeaseUntil: null,
        applicationAvailableAt: new Date(Date.now() + delay * 1000),
      },
    });
  }

  async processProviderEvent(event: VerifiedProviderEvent): Promise<WebhookProcessingResult> {
    return this.prisma.$transaction(async (tx) => {
      const webhook = await tx.paymentWebhook.findUnique({
        where: {
          providerType_providerEventId: {
            providerType: PaymentProvider.STRIPE,
            providerEventId: event.eventId,
          },
        },
      });
      if (!webhook) throw new Error(`Claimed webhook ${event.eventId} was not found`);
      const ignored = async (code: string) => {
        await tx.paymentWebhook.update({
          where: { id: webhook.id },
          data: {
            processedAt: new Date(),
            processingStatus: 'IGNORED',
            processingErrorCode: code,
            processingError: code,
            leaseUntil: null,
          },
        });
        return 'IGNORED' as const;
      };

      if (event.outcome === 'IGNORED') {
        return ignored('UNSUPPORTED_EVENT_OR_PAYMENT_STATUS');
      }

      // Metadata приходит из внешнего события. До запроса UUID-колонки проверяем формат,
      // иначе некорректное значение приведет к ошибке PostgreSQL вместо безопасного IGNORE.
      if (!event.internalPaymentId || !this.isUuid(event.internalPaymentId)) {
        return ignored('INVALID_OR_MISSING_PAYMENT_ID');
      }

      const payment = await tx.payment.findUnique({ where: { id: event.internalPaymentId } });
      if (!payment) {
        return ignored('PAYMENT_NOT_FOUND');
      }

      const expectedMode =
        payment.checkoutPurpose === CheckoutPurpose.INITIAL_SUBSCRIPTION ? 'subscription' : 'payment';
      const mismatch =
        !event.checkoutId ||
        payment.providerCheckoutId !== event.checkoutId ||
        !event.customerId ||
        payment.providerCustomerId !== event.customerId ||
        event.checkoutMode !== expectedMode ||
        event.amount === null ||
        payment.amount !== event.amount ||
        !event.currency ||
        payment.currency.toLowerCase() !== event.currency.toLowerCase() ||
        (event.outcome === 'SUCCEEDED' && expectedMode === 'subscription' && !event.providerSubscriptionId) ||
        (event.outcome === 'SUCCEEDED' && expectedMode === 'payment' && !event.providerPaymentId);
      if (mismatch) {
        return ignored('PAYMENT_DETAILS_MISMATCH');
      }

      // completed/unpaid — промежуточный достоверный факт. Событие обработано,
      // но Payment остается PENDING до async_payment_succeeded/failed.
      if (event.outcome === 'PENDING') {
        await tx.paymentWebhook.update({
          where: { id: webhook.id },
          data: {
            paymentId: payment.id,
            processedAt: new Date(),
            processingStatus: 'PROCESSED',
            leaseUntil: null,
          },
        });
        return 'PROCESSED';
      }

      const nextStatus = PaymentStatus[event.outcome];
      if (payment.status.toString() === nextStatus.toString()) {
        await tx.paymentWebhook.update({
          where: { id: webhook.id },
          data: {
            paymentId: payment.id,
            processedAt: new Date(),
            processingStatus: 'PROCESSED',
            leaseUntil: null,
          },
        });
        return 'PROCESSED';
      }
      if (!Payment.canTransition(payment.status as PaymentStatus, nextStatus)) {
        return ignored('INVALID_STATUS_TRANSITION');
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          applicationStatus:
            nextStatus === PaymentStatus.SUCCEEDED
              ? PaymentApplicationStatus.PENDING
              : payment.applicationStatus,
          applicationAvailableAt: nextStatus === PaymentStatus.SUCCEEDED ? new Date() : null,
          providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
          providerSubscriptionId: event.providerSubscriptionId ?? payment.providerSubscriptionId,
          providerInvoiceId: event.providerInvoiceId ?? payment.providerInvoiceId,
          // Повторный успешный факт не должен менять первоначальное время оплаты.
          paidAt:
            nextStatus === PaymentStatus.SUCCEEDED
              ? (payment.paidAt ?? event.providerCreatedAt ?? new Date())
              : payment.paidAt,
          providerSnapshot: event.snapshot as Prisma.InputJsonValue,
        },
      });
      await tx.paymentWebhook.update({
        where: { id: webhook.id },
        data: {
          paymentId: payment.id,
          processedAt: new Date(),
          processingStatus: 'PROCESSED',
          leaseUntil: null,
        },
      });
      return 'PROCESSED';
    });
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private isUniqueConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
