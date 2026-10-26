import type { IntegrationEvent } from '@app/message-broker';

export abstract class IntegrationEventPublisher {
  abstract publish(event: IntegrationEvent): Promise<void>;
}
