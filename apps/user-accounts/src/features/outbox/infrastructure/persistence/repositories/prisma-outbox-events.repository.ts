import type { IntegrationEvent } from '@app/message-broker';
import { Injectable } from '@nestjs/common';
import type { TransactionContext } from '../../../../../common/application/unit-of-work.js';
import type { Prisma } from '../../../../../database/generated/client.js';
import { PrismaService } from '../../../../../database/prisma.service.js';
import {
  OutboxEventsRepository,
  type OutboxCursor,
} from '../../../application/ports/outbox-events.repository.js';

@Injectable()
export class PrismaOutboxEventsRepository implements OutboxEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(event: IntegrationEvent, ctx: TransactionContext): Promise<void> {
    await (ctx as Prisma.TransactionClient).outboxEvent.create({
      data: {
        id: event.eventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.data,
      },
    });
  }

  findPending(before: Date, cursor?: OutboxCursor): Promise<OutboxCursor[]> {
    return this.prisma.outboxEvent.findMany({
      where: {
        publishedAt: null,
        createdAt: { lte: before },
        // Курсор — значения последней выбранной строки. Она уже могла стать опубликованной.
        ...(cursor && {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, createdAt: true },
    });
  }

  async lockPending(id: string, ctx: TransactionContext): Promise<IntegrationEvent | null> {
    // Блокировка живёт до commit после публикации; занятые другим worker строки пропускаем.
    const [event] = await (ctx as Prisma.TransactionClient).$queryRaw<IntegrationEvent[]>`
      SELECT id AS "eventId", event_type AS "eventType",
             aggregate_type AS "aggregateType", aggregate_id AS "aggregateId", payload AS data
      FROM outbox_events
      WHERE id = ${id}::uuid AND published_at IS NULL
      FOR UPDATE SKIP LOCKED`;
    return event ?? null;
  }

  async markPublished(id: string, ctx: TransactionContext): Promise<void> {
    await (ctx as Prisma.TransactionClient).outboxEvent.update({
      where: { id },
      data: { publishedAt: new Date(), lastError: null },
    });
  }

  async recordFailure(id: string, error: string, ctx: TransactionContext): Promise<void> {
    await (ctx as Prisma.TransactionClient).outboxEvent.update({
      where: { id },
      data: { lastError: error },
    });
  }

  async deletePublishedBefore(before: Date): Promise<void> {
    await this.prisma.outboxEvent.deleteMany({ where: { publishedAt: { lt: before } } });
  }
}
