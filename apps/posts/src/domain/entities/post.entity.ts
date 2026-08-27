import type { PostImage } from './post-image.entity.js';

export type PostProps = {
  id: number;
  authorId: number;
  description: string | null;
  createdAt: Date;
  images: readonly PostImage[];
  version: number;
  deletedAt: Date | null;
};

export class Post {
  readonly id: number;
  readonly authorId: number;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly images: readonly PostImage[];
  readonly version: number;
  readonly deletedAt: Date | null;

  private constructor(props: PostProps) {
    this.id = props.id;
    this.authorId = props.authorId;
    this.description = props.description;
    this.createdAt = props.createdAt;
    this.images = props.images;
    this.version = props.version;
    this.deletedAt = props.deletedAt;
  }

  static restore(props: PostProps): Post {
    return new Post(props);
  }
}
