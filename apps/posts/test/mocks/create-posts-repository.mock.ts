import type { PostsRepository } from '../../src/application/ports/posts.repository.js';

export function createPostsRepositoryMock() {
  return {
    create: vi.fn<PostsRepository['create']>(),
    findById: vi.fn<PostsRepository['findById']>(),
    updateAuthorPost: vi.fn<PostsRepository['updateAuthorPost']>(),
  } satisfies PostsRepository;
}
