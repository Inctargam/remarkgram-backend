export type CreatePostResult = {
  id: number;
};

export type CreatePostRepositoryParams = {
  authorId: number;
  description: string | null;
  imageIds: readonly string[];
};

export type ReserveImageUploadsParams = {
  userId: number;
  imageIds: readonly string[];
  reservationId: string;
};

export type AttachReservedImageUploadsParams = {
  userId: number;
  reservationId: string;
};

export type ReleaseReservedImageUploadsParams = {
  userId: number;
  reservationId: string;
};
