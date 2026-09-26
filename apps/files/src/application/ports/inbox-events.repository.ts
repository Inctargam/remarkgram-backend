import { type TransactionContext } from './unit-of-work.js';
import { type PostDeletedPayload } from '../integration-events/post-deleted.event.js';

export type AddInboxEventRepositoryParams = {
  eventId: string;
  eventType: string;
  payload: PostDeletedPayload;
};
export type AddInboxEventRepositoryResult = {
  eventId: string;
  created: boolean;
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

export type ClaimAvailableEventParams = {
  eventType: string;
  maxAttempts: number;
  batchSize: number;
};

export abstract class InboxEventsRepository {
  abstract add(event: AddInboxEventRepositoryParams): Promise<AddInboxEventRepositoryResult>;
  /**
   * Атомарно резервирует следующее доступное событие.
   * Возвращённый availableAt является токеном аренды: все последующие изменения
   * события обязаны передать его, чтобы запоздавший воркер не перезаписал результат
   * воркера, который получил событие после истечения предыдущей аренды.
   */
  abstract findAvailableBatch(params: ClaimAvailableEventParams): Promise<InboxEventType[] | null>;
  // abstract claimNextAvailableEvent(params: ClaimAvailableEventParams): Promise<InboxEventType | null>;
  abstract markAsProcessed(eventId: string, leaseUntil: Date, ctx?: TransactionContext): Promise<boolean>;
  // abstract reschedule(eventId: string, leaseUntil: Date, lastError: string): Promise<boolean>;
  // abstract markDead(eventId: string, leaseUntil: Date, lastError: string): Promise<boolean>;
  abstract resolveFailedAttempt(
    eventId: string,
    leaseUntil: Date,
    lastError: string,
    maxAttempts: number,
  ): Promise<boolean>;
}
