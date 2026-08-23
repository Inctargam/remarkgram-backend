import type { PostsRepository } from '../../src/application/ports/posts.repository.js';

export function createPostsRepositoryMock() {
  return {
    create: vi.fn<PostsRepository['create']>(),
    publish: vi.fn<PostsRepository['publish']>(),
    findById: vi.fn<PostsRepository['findById']>(),
    updateAuthorPost: vi.fn<PostsRepository['updateAuthorPost']>(),
  } satisfies PostsRepository;
}
