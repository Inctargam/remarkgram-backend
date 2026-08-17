import type {
  AttachReservedImageUploadsParams,
  ReleaseReservedImageUploadsParams,
  ReserveImageUploadsParams,
} from '../types/posts.types.js';

export abstract class ImageUploadsGateway {
  abstract reserveImageUploads(params: ReserveImageUploadsParams): Promise<void>;

  abstract attachReservedImageUploads(params: AttachReservedImageUploadsParams): Promise<void>;

  abstract releaseReservedImageUploads(params: ReleaseReservedImageUploadsParams): Promise<void>;
}
