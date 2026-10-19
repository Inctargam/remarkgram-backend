import { PrismaService } from '../prisma.service.js';
import {
  AddInboxEventRepositoryParams,
  AddInboxEventRepositoryResult,
  ClaimAvailableEventParams,
  InboxEventType,
  InboxEventsRepository,
} from '../../../application/ports/inbox-events.repository.js';
import { type TransactionContext } from '../../../application/ports/unit-of-work.js';
import { Prisma } from '../generated/client.js';
import { Injectable, Logger } from '@nestjs/common';
import type { PostDeletedPayload } from '../../../application/integration-events/post-deleted.event.js';
import { InboxEventStatus } from '../../../domain/enums/inbox-event-status.enum.js';
import { isDeepStrictEqual } from 'node:util';
import { InboxEventIdCollisionError } from '../../../application/errors/inbox-event-id-collision.error.js';

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
  private mapToEvent(raw: InboxEventRaw) {
    return {
      eventId: raw.event_id,
      eventType: raw.event_type,
      payload: {
        userId: raw.payload.userId,
        postId: raw?.payload.postId,
        fileIds: raw?.payload.fileIds ?? [],
        deletedAt: raw?.payload.deletedAt,
      },
      status: raw.status,
      attempts: raw.attempts,
      receivedAt: raw.received_at,
      processedAt: raw.processed_at,
      availableAt: raw.available_at,
      lastError: raw.last_error,
    };
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
        created: true,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Проверяем, что событие уже существует в бд и повторная вставка не завершиться конфликтом
        const existing = await client.inboxEvents.findUnique({
          where: {
            eventId: event.eventId,
          },
        });
        if (!existing) throw error;

        if (existing.eventType !== event.eventType || !isDeepStrictEqual(existing.payload, event.payload)) {
          throw new InboxEventIdCollisionError(event.eventId);
        }

        return {
          eventId: existing.eventId,
          created: false,
        };
      }

      throw error;
    }
  }

  async findAvailableBatch(params: ClaimAvailableEventParams): Promise<InboxEventType[] | null> {
    const client = this.getClient();

    /*
     * exhausted_events закрывает события, для которых worker получил последнюю
     * попытку и завершился аварийно до resolveFailedAttempt. После истечения
     * available_at, выполняющего роль lease, такое событие уже нельзя повторно
     * claim из-за attempts >= maxAttempts, поэтому переводим его в DEAD.
     *
     * SELECT блокирует кандидата до завершения всего SQL-запроса. SKIP LOCKED
     * позволяет нескольким воркерам одновременно резервировать разные события.
     *
     * После UPDATE блокировка БД освобождается, а available_at становится арендой
     * на две минуты. date_trunc сохраняет миллисекундную точность, совместимую с
     * JavaScript Date: возвращённое значение можно безопасно использовать как
     * токен оптимистической блокировки в markAsProcessed/reschedule/markDead.
     */
    const events = await client.$queryRaw<InboxEventRaw[]>`
      WITH exhausted_events AS (
        UPDATE inbox_events
        SET status = ${InboxEventStatus.DEAD}::"InboxStatus",
            last_error = COALESCE(last_error, 'Maximum inbox processing attempts reached')
        WHERE event_type = ${params.eventType}
          AND status = ${InboxEventStatus.RECEIVED}::"InboxStatus"
          AND attempts >= ${params.maxAttempts}
          AND available_at <= CURRENT_TIMESTAMP
      ),
      claimed_events AS (
        SELECT event_id
        FROM inbox_events
        WHERE event_type = ${params.eventType}
          AND attempts < ${params.maxAttempts}
          AND available_at <= CURRENT_TIMESTAMP
          AND status = ${InboxEventStatus.RECEIVED}::"InboxStatus"
      ORDER BY available_at, received_at
        FOR UPDATE SKIP LOCKED
              LIMIT ${params.batchSize}
              )
      UPDATE inbox_events AS event
      SET available_at = date_trunc(
        'milliseconds',
        CURRENT_TIMESTAMP + INTERVAL '2 minutes'
      ),
        attempts = event.attempts + 1
      FROM claimed_events
      WHERE event.event_id = claimed_events.event_id
        RETURNING event.*;
    `;
    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }

    return events.map((event) => this.mapToEvent(event));
  }

  async markAsProcessed(eventId: string, leaseUntil: Date, ctx?: TransactionContext): Promise<boolean> {
    const client = this.getClient(ctx);
    const result = await client.inboxEvents.updateMany({
      where: {
        eventId,
        availableAt: leaseUntil,
        status: InboxEventStatus.RECEIVED,
      },
      data: {
        lastError: null,
        processedAt: new Date(),
        status: InboxEventStatus.PROCESSED,
      },
    });

    return result.count === 1;
  }

  async resolveFailedAttempt(
    eventId: string,
    leaseUntil: Date,
    lastError: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const number = await this.prisma.$executeRaw`
      UPDATE inbox_events
      SET status       = CASE
                           WHEN attempts >= ${maxAttempts}
                             THEN ${InboxEventStatus.DEAD}::"InboxStatus"
                           ELSE ${InboxEventStatus.RECEIVED}::"InboxStatus"
        END,

          available_at = CASE
                           WHEN attempts >= ${maxAttempts}
                             THEN available_at
                           ELSE now() + (
                             interval '10 seconds' * power(2, attempts - 1)
                             )
            END,

          last_error   = ${lastError}
      WHERE event_id = ${eventId}
        AND status = ${InboxEventStatus.RECEIVED}::"InboxStatus"
        AND available_at = ${leaseUntil};
    `;

    return number > 0;
  }
}
