import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { IntegrationEvent } from '@app/message-broker';
import { lastValueFrom, timeout } from 'rxjs';
import { AvatarDeletionPublisher } from '../../application/ports/avatar-deletion.publisher.js';

export const AVATAR_DELETION_RMQ_CLIENT = 'AVATAR_DELETION_RMQ_CLIENT';

@Injectable()
export class RmqAvatarDeletionPublisher implements AvatarDeletionPublisher {
  constructor(@Inject(AVATAR_DELETION_RMQ_CLIENT) private readonly client: ClientProxy) {}

  async publish(event: IntegrationEvent): Promise<void> {
    // emit подключается лениво: недоступность брокера не блокирует запуск user-accounts.
    // pg-boss повторит публикацию, если подтверждение не пришло за 5 секунд.
    await lastValueFrom(this.client.emit(event.eventType, event).pipe(timeout(5_000)), {
      defaultValue: undefined,
    });
  }
}
