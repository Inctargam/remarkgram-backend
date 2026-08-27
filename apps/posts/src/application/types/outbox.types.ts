import type { OutboxStatus } from '../../domain/enums/outbox-event-status.enum.js';

export type ApplicationOutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  status: keyof typeof OutboxStatus;
  attempts: number;
  availableAt: Date;
  createdAt: Date;
  publishedAt: Date | null;
  lastError: string | null;
};
