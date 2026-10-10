import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../database/prisma/generated/client.js';
import type { ProviderCheckout, VerifiedProviderEvent } from '../application/ports/payment-provider.js';
import {
  PaymentsRepository,
  type WebhookProcessingResult,
} from '../application/ports/payments.repository.js';
import { Payment, PaymentProvider, PaymentStatus } from '../domain/payment.entity.js';
import { PaymentPrismaMapper } from './payment-prisma.mapper.js';

@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(payment: Payment): Promise<Payment> {
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
      return PaymentPrismaMapper.toDomain(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          console.error(error?.meta);
        }
      }
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

  async attachCheckout(paymentId: string, checkout: ProviderCheckout): Promise<Payment> {
    const row = await this.prisma.payment.update({
      where: { id: paymentId },
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
    return PaymentPrismaMapper.toDomain(row);
  }

  async markStatus(paymentId: string, status: PaymentStatus): Promise<void> {
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status } });
  }

  async processProviderEvent(event: VerifiedProviderEvent): Promise<WebhookProcessingResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const webhook = await tx.paymentWebhook.create({
          data: {
            providerType: PaymentProvider.STRIPE,
            providerEventId: event.eventId,
            eventType: event.eventType,
            payload: event.snapshot as Prisma.InputJsonValue,
          },
        });

        if (event.outcome === 'IGNORED') {
          await tx.paymentWebhook.update({
            where: { id: webhook.id },
            // TODO: Разделить обобщенную причину на UNSUPPORTED_EVENT_TYPE,
            // UNSUPPORTED_PAYMENT_STATUS и UNSUPPORTED_CHECKOUT_MODE после того,
            // как нормализация события начнет возвращать гранулярную причину IGNORE.
            data: { processedAt: new Date(), processingError: 'UNSUPPORTED_EVENT_OR_PAYMENT_STATUS' },
          });
          return 'IGNORED';
        }

        // Metadata приходит из внешнего события. До запроса UUID-колонки проверяем формат,
        // иначе некорректное значение приведет к ошибке PostgreSQL вместо безопасного IGNORE.
        if (!event.internalPaymentId || !this.isUuid(event.internalPaymentId)) {
          await tx.paymentWebhook.update({
            where: { id: webhook.id },
            data: { processedAt: new Date(), processingError: 'INVALID_OR_MISSING_PAYMENT_ID' },
          });
          return 'IGNORED';
        }

        const payment = await tx.payment.findUnique({ where: { id: event.internalPaymentId } });
        if (!payment) {
          await tx.paymentWebhook.update({
            where: { id: webhook.id },
            data: { processedAt: new Date(), processingError: 'PAYMENT_NOT_FOUND' },
          });
          return 'IGNORED';
        }

        const paymentCustomer = await tx.paymentCustomer.findUnique({
          where: {
            userId_providerType: {
              userId: payment.userId,
              providerType: PaymentProvider.STRIPE,
            },
          },
        });

        const mismatch =
          (event.checkoutId !== null && payment.providerCheckoutId !== event.checkoutId) ||
          !event.customerId ||
          !paymentCustomer ||
          paymentCustomer.providerCustomerId !== event.customerId ||
          (event.amount !== null && payment.amount !== event.amount) ||
          (event.currency !== null && payment.currency.toLowerCase() !== event.currency.toLowerCase());
        if (mismatch) {
          await tx.paymentWebhook.update({
            where: { id: webhook.id },
            data: { processedAt: new Date(), processingError: 'PAYMENT_DETAILS_MISMATCH' },
          });
          return 'IGNORED';
        }

        // completed/unpaid — промежуточный достоверный факт. Событие обработано,
        // но Payment остается PENDING до async_payment_succeeded/failed.
        if (event.outcome === 'PENDING') {
          await tx.paymentWebhook.update({
            where: { id: webhook.id },
            data: { paymentId: payment.id, processedAt: new Date() },
          });
          return 'PROCESSED';
        }

        const nextStatus = PaymentStatus[event.outcome];
        if (!Payment.canTransition(payment.status as PaymentStatus, nextStatus)) {
          await tx.paymentWebhook.update({
            where: { id: webhook.id },
            data: { processedAt: new Date(), processingError: 'INVALID_STATUS_TRANSITION' },
          });
          return 'IGNORED';
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: nextStatus,
            providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
            providerSubscriptionId:
              event.providerSubscriptionId ?? payment.providerSubscriptionId,
            providerInvoiceId: event.providerInvoiceId ?? payment.providerInvoiceId,
            // Повторный успешный факт не должен менять первоначальное время оплаты.
            paidAt: nextStatus === PaymentStatus.SUCCEEDED ? (payment.paidAt ?? new Date()) : payment.paidAt,
            providerSnapshot: event.snapshot as Prisma.InputJsonValue,
          },
        });
        await tx.paymentWebhook.update({
          where: { id: webhook.id },
          data: { paymentId: payment.id, processedAt: new Date() },
        });
        return 'PROCESSED';
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'DUPLICATE';
      throw error;
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
