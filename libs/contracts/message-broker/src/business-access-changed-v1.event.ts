import type { IntegrationEvent } from './integration-event.js';
import type { BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME } from './message-broker.constants.js';

export type BusinessAccessChangedV1Event = IntegrationEvent<
  typeof BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
  {
    userId: number;
    hasBusinessAccess: boolean;
    // Десятичная строка bigint. Получатель сравнивает численно и применяет только более новую версию.
    version: string;
  }
>;
