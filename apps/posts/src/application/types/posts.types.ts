export type CreatePostResult = {
  id: number;
};

export type CreatePostRepositoryParams = {
  authorId: number;
  description: string | null;
  imageIds: readonly string[];
};

export type EnsureCompletedImagesParams = {
  userId: number;
  imageIds: readonly string[];
};
