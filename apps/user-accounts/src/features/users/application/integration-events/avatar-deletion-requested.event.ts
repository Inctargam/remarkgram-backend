import { randomUUID } from 'node:crypto';
import {
  AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
  type AvatarDeletionRequestedV1Event,
} from '@app/message-broker';

export function createAvatarDeletionEvent(userId: number, fileId: string): AvatarDeletionRequestedV1Event {
  return {
    eventId: randomUUID(),
    eventType: AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
    data: { userId, fileId },
  };
}
