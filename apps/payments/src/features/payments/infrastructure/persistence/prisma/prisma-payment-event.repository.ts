import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../database/prisma/generated/client.js';
import type { PaymentEvent } from '../../../application/events/payment-event.js';
import {
  PaymentEventRepository,
  type PaymentEventFailure,
  type PersistPaymentEventResult,
} from '../../../application/ports/payment-event.repository.js';
import type { PaymentsTransactionContext } from '../../../application/ports/payments-unit-of-work.js';

@Injectable()
export class PrismaPaymentEventRepository extends PaymentEventRepository {
  async saveIfAbsent(
    event: PaymentEvent,
    workflowId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<PersistPaymentEventResult> {
    const client = this.getClient(ctx);
    return client.paymentWebhook.upsert({
      where: {
        providerType_providerEventId: {
          providerType: event.provider,
          providerEventId: event.providerEventId,
        },
      },
      create: {
        paymentId: event.paymentId,
        providerType: event.provider,
        providerEventId: event.providerEventId,
        eventType: event.providerEventType,
        payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
        providerCreatedAt: event.providerCreatedAt,
        workflowId,
      },
      update: {},
      select: { id: true },
    });
  }

  async recordAttempt(eventId: string, attempt: number, ctx: PaymentsTransactionContext): Promise<void> {
    await this.updateExactlyOne(
      this.getClient(ctx).paymentWebhook.updateMany({
        where: {
          id: eventId,
          processingStatus: { in: ['RECEIVED', 'RETRYING'] },
        },
        data: {
          processingStatus: attempt > 1 ? 'RETRYING' : 'RECEIVED',
          processingAttempts: attempt,
          processingErrorCode: null,
          processingError: null,
        },
      }),
      eventId,
      'record attempt',
    );
  }

  async attachPayment(eventId: string, paymentId: string, ctx: PaymentsTransactionContext): Promise<void> {
    await this.updateExactlyOne(
      this.getClient(ctx).paymentWebhook.updateMany({
        where: {
          id: eventId,
          OR: [{ paymentId: null }, { paymentId }],
        },
        data: { paymentId },
      }),
      eventId,
      'attach payment',
    );
  }

  async markProcessed(eventId: string, ctx: PaymentsTransactionContext): Promise<void> {
    await this.finish(eventId, 'PROCESSED', null, ctx);
  }

  async markIgnored(
    eventId: string,
    reason: PaymentEventFailure,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    await this.finish(eventId, 'IGNORED', reason, ctx);
  }

  async markRetrying(
    eventId: string,
    failure: PaymentEventFailure,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    await this.updateExactlyOne(
      this.getClient(ctx).paymentWebhook.updateMany({
        where: {
          id: eventId,
          processingStatus: { in: ['RECEIVED', 'RETRYING'] },
        },
        data: {
          processingStatus: 'RETRYING',
          processedAt: null,
          processingErrorCode: failure.code,
          processingError: this.sanitizeError(failure.message),
        },
      }),
      eventId,
      'schedule retry',
    );
  }

  async markDead(
    eventId: string,
    failure: PaymentEventFailure,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    await this.finish(eventId, 'DEAD', failure, ctx);
  }

  private async finish(
    eventId: string,
    status: 'PROCESSED' | 'IGNORED' | 'DEAD',
    failure: PaymentEventFailure | null,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    await this.updateExactlyOne(
      this.getClient(ctx).paymentWebhook.updateMany({
        where: {
          id: eventId,
          processingStatus: { in: ['RECEIVED', 'RETRYING'] },
        },
        data: {
          processingStatus: status,
          processedAt: new Date(),
          processingErrorCode: failure?.code ?? null,
          processingError: failure ? this.sanitizeError(failure.message) : null,
        },
      }),
      eventId,
      `mark ${status.toLowerCase()}`,
    );
  }

  private getClient(ctx: PaymentsTransactionContext): Prisma.TransactionClient {
    return ctx as Prisma.TransactionClient;
  }

  private async updateExactlyOne(
    update: Promise<Prisma.BatchPayload>,
    eventId: string,
    operation: string,
  ): Promise<void> {
    if ((await update).count !== 1) throw new Error(`Cannot ${operation} for payment webhook ${eventId}`);
  }

  private sanitizeError(message: string): string {
    return message.replaceAll(/[\r\n\t]+/g, ' ').slice(0, 1000);
  }
}
