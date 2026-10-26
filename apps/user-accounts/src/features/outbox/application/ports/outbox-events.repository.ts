import type { IntegrationEvent } from '@app/message-broker';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export type OutboxCursor = { id: string; createdAt: Date };

// Общий outbox исходящих интеграционных событий user-accounts.
export abstract class OutboxEventsRepository {
  abstract add(event: IntegrationEvent, ctx: TransactionContext): Promise<void>;
  abstract findPending(before: Date, cursor?: OutboxCursor): Promise<OutboxCursor[]>;
  abstract lockPending(id: string, ctx: TransactionContext): Promise<IntegrationEvent | null>;
  abstract markPublished(id: string, ctx: TransactionContext): Promise<void>;
  abstract recordFailure(id: string, error: string, ctx: TransactionContext): Promise<void>;
  abstract deletePublishedBefore(before: Date): Promise<void>;
}
