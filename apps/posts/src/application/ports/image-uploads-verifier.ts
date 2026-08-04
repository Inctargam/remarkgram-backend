import type { EnsureCompletedImagesParams } from '../types/posts.types.js';

export abstract class ImageUploadsVerifier {
  abstract ensureCompleted(params: EnsureCompletedImagesParams): Promise<void>;
}
