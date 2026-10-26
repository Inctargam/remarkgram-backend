import type { PostImageAttachmentParams } from '../types/posts.types.js';

export abstract class FilesGateway {
  abstract attachPostImages(params: PostImageAttachmentParams): Promise<void>;
  abstract cancelPostImageAttachment(params: PostImageAttachmentParams): Promise<void>;
}
