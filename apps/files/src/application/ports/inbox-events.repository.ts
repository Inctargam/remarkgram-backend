import { type TransactionContext } from './unit-of-work.js';
import { type PostDeletedPayload } from '../integration-events/post-deleted.event.js';

export type AddInboxEventRepositoryParams = {
  eventId: string;
  eventType: string;
  payload: PostDeletedPayload;
};
export type AddInboxEventRepositoryResult = {
  eventId: string;
};
export type InboxEventType = {
  eventId: string;
  eventType: string;
  payload: PostDeletedPayload;
  status: string;
  attempts: number;
  receivedAt: Date;
  processedAt: Date | null;
  availableAt: Date;
  lastError: string | null;
};

export type FindAvailableEventsRepositoryResult = InboxEventType[] | null;
export type FindAvailableEventsByTypeParams = {
  limit: number;
  eventType: string;
};

export abstract class InboxEventsRepository {
  abstract add(event: AddInboxEventRepositoryParams): Promise<AddInboxEventRepositoryResult>;
  abstract findAvailableEventsByType(
    params: FindAvailableEventsByTypeParams,
    ctx?: TransactionContext,
  ): Promise<FindAvailableEventsRepositoryResult>;
  abstract markAsProcessed(eventId: string, ctx?: TransactionContext): Promise<boolean>;
  abstract reschedule(eventId: string, lastError: string): Promise<boolean>;
  abstract markDead(eventId: string, lastError: string): Promise<void>;
}
