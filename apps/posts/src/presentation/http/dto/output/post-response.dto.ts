import { Post } from '../../../../domain/entities/post.entity.js';

export class PostResponseDto {
  constructor(
    readonly id: number,
    readonly title: string,
    readonly content: string,
  ) {}

  static mapToView(post: Post): PostResponseDto {
    return new PostResponseDto(post.id as number, post.title, post.content);
  }
}
