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
      },
    });
    return PaymentPrismaMapper.toDomain(row);
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
        providerPaymentId: checkout.paymentId,
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

        if (event.outcome === 'IGNORED' || !event.internalPaymentId) {
          await tx.paymentWebhook.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
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

        const mismatch =
          (event.checkoutId !== null && payment.providerCheckoutId !== event.checkoutId) ||
          (event.amount !== null && payment.amount !== event.amount) ||
          (event.currency !== null && payment.currency.toLowerCase() !== event.currency.toLowerCase());
        if (mismatch) {
          await tx.paymentWebhook.update({
            where: { id: webhook.id },
            data: { processedAt: new Date(), processingError: 'PAYMENT_DETAILS_MISMATCH' },
          });
          return 'IGNORED';
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
            paidAt: nextStatus === PaymentStatus.SUCCEEDED ? new Date() : payment.paidAt,
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
}
