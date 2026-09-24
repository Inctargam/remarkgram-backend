import type { AvatarDeletionRequestedV1Event } from '@app/message-broker';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class AvatarDeletionOutbox {
  abstract enqueue(event: AvatarDeletionRequestedV1Event, transaction: TransactionContext): Promise<void>;
  abstract wake(): void;
}
