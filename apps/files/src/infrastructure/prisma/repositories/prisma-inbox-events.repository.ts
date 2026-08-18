import { PrismaService } from '../prisma.service.js';
import {
  AddInboxEventRepositoryParams,
  AddInboxEventRepositoryResult,
  FindAvailableEventsByTypeParams,
  FindAvailableEventsRepositoryResult,
  InboxEventsRepository,
} from '../../../application/ports/inbox-events.repository.js';
import { type TransactionContext } from '../../../application/ports/unit-of-work.js';
import { Prisma } from '../generated/client.js';
import { Injectable, Logger } from '@nestjs/common';
import type { PostDeletedPayload } from '../../../application/integration-events/post-deleted.event.js';

type InboxEventRaw = {
  event_id: string;
  event_type: string;
  payload: PostDeletedPayload;
  status: string;
  attempts: number;
  received_at: Date;
  processed_at: Date | null;
  available_at: Date;
  last_error: string | null;
};

@Injectable()
export class PrismaInboxEventsRepository implements InboxEventsRepository {
  private readonly logger = new Logger(PrismaInboxEventsRepository.name);
  constructor(private readonly prisma: PrismaService) {}
  private getClient(ctx?: TransactionContext) {
    return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }
  async add(event: AddInboxEventRepositoryParams): Promise<AddInboxEventRepositoryResult> {
    const client = this.getClient();
    try {
      const created = await client.inboxEvents.create({
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event.payload,
        },
      });
      return {
        eventId: created.eventId,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Проверяем, что событие уже существует в бд и повторная вставка не завершиться конфликтом
        const existing = await client.inboxEvents.findUnique({
          where: {
            eventId: event.eventId,
          },
        });
        return existing
          ? {
              eventId: existing.eventId,
            }
          : Promise.reject(error);
      }

      throw error;
    }
  }

  async findAvailableEventsByType(
    params: FindAvailableEventsByTypeParams,
    ctx?: TransactionContext,
  ): Promise<FindAvailableEventsRepositoryResult> {
    const client = this.getClient(ctx);

    const events = await client.$queryRaw<InboxEventRaw[]>`SELECT event_id,
                                                                  event_type,
                                                                  payload,
                                                                  status,
                                                                  attempts,
                                                                  received_at,
                                                                  processed_at,
                                                                  available_at,
                                                                  last_error
                                                           FROM inbox_events
                                                           WHERE status IN ('RECEIVED', 'FAILED')
                                                             AND event_type = ${params.eventType}
                                                             AND available_at <= CURRENT_TIMESTAMP
                                                             AND attempts < 5
                                                           ORDER BY available_at, received_at
                                                             FOR UPDATE SKIP LOCKED
                                                           LIMIT ${params.limit}
    `;
    if (!Array.isArray(events) || events.length === 0) return null;
    return events.map((event: InboxEventRaw) => ({
      eventId: event.event_id,
      eventType: event.event_type,
      payload: {
        userId: event.payload.userId,
        postId: event?.payload.postId,
        fileIds: event?.payload.fileIds ?? [],
        deletedAt: event?.payload.deletedAt,
      },
      status: event.status,
      attempts: event.attempts,
      receivedAt: event.received_at,
      processedAt: event.processed_at,
      availableAt: event.available_at,
      lastError: event.last_error,
    }));
  }
  async markAsProcessed(eventId: string, ctx?: TransactionContext): Promise<boolean> {
    const client = this.getClient(ctx);

    const result = await client.inboxEvents.updateMany({
      where: {
        eventId,
        status: { in: ['RECEIVED', 'FAILED'] },
      },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lastError: null,
      },
    });

    if (result.count !== 1) {
      throw new Error(`Inbox event ${eventId} could not be marked as PROCESSED`);
    }

    return true;
  }

  async reschedule(eventId: string, lastError: string): Promise<boolean> {
    const result = await this.prisma.inboxEvents.updateMany({
      where: {
        eventId,
        status: { in: ['RECEIVED', 'FAILED'] },
      },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        availableAt: new Date(Date.now() + 10_000),
        lastError,
      },
    });

    if (result.count !== 1) {
      throw new Error(`Inbox event ${eventId} could not be rescheduled`);
    }

    return true;
  }

  async markDead(eventId: string, lastError: string): Promise<void> {
    const result = await this.prisma.inboxEvents.updateMany({
      where: {
        eventId,
        status: { in: ['RECEIVED', 'FAILED'] },
      },
      data: {
        status: 'DEAD',
        attempts: { increment: 1 },
        lastError: lastError ?? null,
      },
    });

    if (result.count !== 1) {
      throw new Error(`Inbox event ${eventId} could not be marked as DEAD`);
    }
  }
}
