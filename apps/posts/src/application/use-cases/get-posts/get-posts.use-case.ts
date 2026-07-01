import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { Post } from '../../../domain/entities/post.entity.js';
import { PostsRepository } from '../../ports/posts.repository.js';

export class GetPostsQuery extends Query<Post[]> {}

@QueryHandler(GetPostsQuery)
export class GetPostsQueryHandler implements IQueryHandler<GetPostsQuery> {
  constructor(private readonly postsRepository: PostsRepository) {}

  async execute() {
    return this.postsRepository.findMany();
  }
}
