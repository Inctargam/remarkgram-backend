import type { OutboxEventsRepository } from '../../../application/ports/outbox-events.repository.js';
import type { IntegrationEvent } from '@app/message-broker';
import type { Prisma } from '../generated/client.js';
import type { PrismaService } from '../prisma.service.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';
import { Logger } from '@nestjs/common';

export class PrismaOutboxEventsRepository implements OutboxEventsRepository {
  private readonly logger = new Logger(PrismaOutboxEventsRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  private getClient(ctx?: TransactionContext) {
    return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async add(event: IntegrationEvent, ctx?: TransactionContext): Promise<void> {
    const client = this.getClient(ctx);
    await client.outboxEvent.create({
      data: {
        id: event.eventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.data,
      },
    });
  }
}
