import {
  FindAvailableBatchRepositoryResult,
  OutboxEventsRepository,
} from '../../../application/ports/outbox-events.repository.js';
import type { IntegrationEvent } from '@app/message-broker';
import type { Prisma } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';
import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '../../../domain/enums/outbox-event-status.enum.js';
import type { ApplicationOutboxEvent } from '../../../application/types/outbox.types.js';
import { OutboxEventModel } from '../generated/models/OutboxEvent.js';

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

  async ensurePublished(eventId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET status = ${OutboxStatus.PUBLISHED}::"OutboxStatus",
          published_at = now(),
          last_error = NULL
      WHERE id = ${eventId}::uuid
        AND status <> ${OutboxStatus.PUBLISHED}::"OutboxStatus";
    `;
  }

  async findAvailableBatch(
    eventType: string,
    maxAttempts: number,
    maxBatchSize: number,
  ): Promise<FindAvailableBatchRepositoryResult> {
    /*
     * exhausted_events восстанавливает состояние после аварийного завершения
     * worker. attempts увеличивается при claim, поэтому процесс может получить
     * последнюю разрешённую попытку и упасть до resolveFailedAttempt. После
     * истечения available_at (текущей lease) такое событие уже не подходит под
     * attempts < maxAttempts и осталось бы в PENDING навсегда. Перед новым
     * claim атомарно переводим эти события в DEAD.
     */
    // При захвате события увеличиваем attempts, фиксируя количество начатых попыток обработки.
    // available_at переносим в будущее, временно резервируя событие за текущим воркером.
    // При этом available_at выполняет роль срока аренды, но не уникального токена владения.
    const events = await this.prisma.$queryRaw<OutboxEventModel[]>`
      WITH exhausted_events AS (
        UPDATE outbox_events
        SET status = ${OutboxStatus.DEAD}::"OutboxStatus",
            last_error = COALESCE(last_error, 'Maximum publishing attempts reached')
        WHERE event_type = ${eventType}
          AND status = ${OutboxStatus.PENDING}::"OutboxStatus"
          AND attempts >= ${maxAttempts}
          AND available_at <= CURRENT_TIMESTAMP
      ),
      pending_events AS (
        SELECT id
        FROM outbox_events
        WHERE status = ${OutboxStatus.PENDING}::"OutboxStatus"
          AND event_type = ${eventType}
          AND attempts < ${maxAttempts}
          AND available_at <= CURRENT_TIMESTAMP
        ORDER BY available_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${maxBatchSize}
      ), claimed_events AS (
        UPDATE outbox_events AS outbox
        SET available_at = date_trunc(
              'milliseconds',
              CURRENT_TIMESTAMP + INTERVAL '2 minutes'
            ),
            attempts = outbox.attempts + 1
        FROM pending_events
        WHERE outbox.id = pending_events.id
        RETURNING outbox.*
      )
      SELECT id,
             event_type     AS "eventType",
             aggregate_type AS "aggregateType",
             aggregate_id   AS "aggregateId",
             payload,
             status,
             attempts,
             available_at   AS "availableAt",
             created_at     AS "createdAt",
             published_at   AS "publishedAt",
             last_error     AS "lastError"
      FROM claimed_events;
    `;
    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }
    return events.map(
      (record) =>
        ({
          id: record.id,
          eventType: record.eventType,
          aggregateType: record.aggregateType,
          aggregateId: record.aggregateId,
          payload: record.payload,
          status: record.status,
          attempts: record.attempts,
          availableAt: record.availableAt,
          createdAt: record.createdAt,
          publishedAt: record.publishedAt,
          lastError: record.lastError,
        }) satisfies ApplicationOutboxEvent,
    );
  }

  async resolveFailedAttempt(
    eventId: string,
    leaseUntil: Date,
    lastError: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const number = await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET status       = CASE
                           WHEN attempts >= ${maxAttempts}
                             THEN 'DEAD'
                           ELSE 'PENDING'
        END,

          available_at = CASE
                           WHEN attempts >= ${maxAttempts}
                             THEN available_at
                           ELSE now() + (
                             interval '10 seconds' * power(2, attempts - 1)
                             )
            END,

          last_error   = ${lastError}

      WHERE id = ${eventId}
        AND status = 'PENDING'
        AND available_at = ${leaseUntil};
    `;

    return number > 0;
  }
}
