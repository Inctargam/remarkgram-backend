export const FILES_POST_DELETED_EVENT_TYPE = 'posts.post-deleted.v1' as const;

export type PostDeletedPayload = {
  postId: number;
  userId: number;
  fileIds: string[];
  deletedAt: string;
};

export type PostDeletedInboxEvent = {
  eventId: string;
  eventType: typeof FILES_POST_DELETED_EVENT_TYPE;
  payload: PostDeletedPayload;
};
