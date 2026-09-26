import type { Post, PostImage } from '../generated/client.js';

type PostImageItem = {
  fileId: string;
  position: number;
};
export class PostViewMapper {
  declare id: string;
  declare authorId: string;
  declare description: string | undefined;
  declare createdAt: string;
  declare images: PostImageItem[];

  static toView(postWithImage: Post & { images?: PostImage[] }): PostViewMapper {
    const view = new PostViewMapper();
    view.id = postWithImage.id.toString();
    view.authorId = postWithImage.authorId.toString();
    view.description = postWithImage.description ?? undefined;
    view.createdAt = postWithImage.createdAt.toISOString();

    const images =
      Array.isArray(postWithImage.images) && postWithImage.images.length > 0 ? postWithImage.images : [];

    view.images = images.map((image: PostImage) => ({
      fileId: image.fileId,
      position: image.position,
    }));
    return view;
  }
}
