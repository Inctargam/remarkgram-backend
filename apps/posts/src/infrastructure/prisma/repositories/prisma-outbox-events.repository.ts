import type {
  OutboxEventsRepository,
  PendingOutboxEvent,
} from '../../../application/ports/outbox-events.repository.js';
import type { IntegrationEvent } from '@app/message-broker';
import type { Prisma } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PrismaOutboxEventsRepository implements OutboxEventsRepository {
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

  async findAvailable(limit: number): Promise<PendingOutboxEvent[]> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    return rows.map((row) => ({
      attempts: row.attempts,
      event: {
        eventId: row.id,
        eventType: row.eventType,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        data: row.payload as IntegrationEvent['data'],
      },
    }));
  }

  async markPublished(eventId: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null },
    });
  }

  async reschedule(eventId: string, error: string, availableAt: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { attempts: { increment: 1 }, availableAt, lastError: error },
    });
  }

  async markDead(eventId: string, error: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { status: 'DEAD', attempts: { increment: 1 }, lastError: error },
    });
  }
}
