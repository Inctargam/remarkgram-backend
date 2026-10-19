import type { IntegrationEvent } from './integration-event.js';
import { type POST_DELETED_V1_EVENT_NAME } from '@app/message-broker/message-broker.constants.js';

export type PostDeletedV1Event = IntegrationEvent<
  typeof POST_DELETED_V1_EVENT_NAME,
  {
    postId: number;
    authorId: number;
    fileIds: string[];
    deletedAt: string;
  }
>;
