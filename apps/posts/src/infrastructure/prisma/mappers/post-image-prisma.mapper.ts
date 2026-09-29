import { PostImage } from '../../../domain/entities/post-image.entity.js';
import type { PostImageModel } from '../generated/models/PostImage.js';

export class PostImagePrismaMapper {
  static toDomain(row: PostImageModel): PostImage {
    return PostImage.restore({
      fileId: row.fileId,
      position: row.position,
    });
  }
}
