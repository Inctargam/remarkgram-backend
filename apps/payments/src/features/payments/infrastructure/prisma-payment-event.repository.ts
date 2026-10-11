import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../database/prisma/generated/client.js';
import type { PaymentEvent } from '../application/events/payment-event.js';
import {
  PaymentEventRepository,
  type SavePaymentEventResult,
} from '../application/ports/payment-event.repository.js';

@Injectable()
export class PrismaPaymentEventRepository extends PaymentEventRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async saveIfAbsent(event: PaymentEvent): Promise<SavePaymentEventResult> {
    try {
      await this.prisma.paymentWebhook.create({
        data: {
          providerType: event.provider,
          providerEventId: event.providerEventId,
          eventType: event.providerEventType,
          // Храним адаптированное событие целиком: recovery сможет восстановить его
          // без повторной интерпретации provider-specific payload.
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
        },
      });
      return 'RECEIVED';
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'DUPLICATE';
      throw error;
    }
  }
}
