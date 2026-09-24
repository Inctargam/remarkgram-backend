import type { IntegrationEvent } from '@app/message-broker';

export abstract class AvatarDeletionPublisher {
  abstract publish(event: IntegrationEvent): Promise<void>;
}
