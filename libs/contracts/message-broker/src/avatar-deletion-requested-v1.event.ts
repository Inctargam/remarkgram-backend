import type { IntegrationEvent } from './integration-event.js';
import type { AVATAR_DELETION_REQUESTED_V1_EVENT_NAME } from './message-broker.constants.js';

export type AvatarDeletionRequestedV1Event = IntegrationEvent<
  typeof AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
  { userId: number; fileId: string }
>;
