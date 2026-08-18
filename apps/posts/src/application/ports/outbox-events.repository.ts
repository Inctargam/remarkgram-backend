import type { IntegrationEvent } from '@app/message-broker';
import type { TransactionContext } from './unit-of-work.js';

export type PendingOutboxEvent = {
  event: IntegrationEvent;
  attempts: number;
};

export abstract class OutboxEventsRepository {
  abstract add(event: IntegrationEvent, ctx?: TransactionContext): Promise<void>;
  abstract findAvailable(limit: number): Promise<PendingOutboxEvent[]>;
  abstract markPublished(eventId: string): Promise<void>;
  abstract reschedule(eventId: string, error: string, availableAt: Date): Promise<void>;
  abstract markDead(eventId: string, error: string): Promise<void>;
}
