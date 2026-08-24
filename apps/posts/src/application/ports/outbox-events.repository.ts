import type { IntegrationEvent } from '@app/message-broker';
import type { TransactionContext } from './unit-of-work.js';
import type { ApplicationOutboxEvent } from '../types/outbox.types.js';

export type FindAvailableBatchRepositoryResult = ApplicationOutboxEvent[] | null;
export abstract class OutboxEventsRepository {
  abstract add(event: IntegrationEvent, ctx?: TransactionContext): Promise<void>;
  abstract findAvailableBatch(
    eventType: string,
    maxAttempts: number,
    batchSize: number,
  ): Promise<FindAvailableBatchRepositoryResult>;
  abstract ensurePublished(eventId: string): Promise<void>;
  abstract resolveFailedAttempt(
    eventId: string,
    leaseUntil: Date,
    lastError: string,
    maxAttempts: number,
  ): Promise<boolean>;
}
