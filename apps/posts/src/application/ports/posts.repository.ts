import { Post } from '../../domain/entities/post.entity.js';

export abstract class PostsRepository {
  abstract findAll(): Promise<Post[]>;
  abstract create(post: Post): Promise<Post>;
}
