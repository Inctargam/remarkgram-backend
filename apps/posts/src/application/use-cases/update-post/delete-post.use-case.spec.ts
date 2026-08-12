import { beforeEach, describe, expect } from 'vitest';
import { UpdatePostCommand, UpdatePostUseCase } from './update-post.use-case.js';
import { Post } from '../../../domain/entities/post.entity.js';
import { PostNotFoundError } from '../../errors/base-post.errors.js';
import { PostUpdateForbiddenError } from '../../errors/update-post.errors.js';
import { createPostsRepositoryMock } from '../../../../test/mocks/create-posts-repository.mock.js';

describe('UpdatePostHandler', () => {
  const postRepository = createPostsRepositoryMock();
  const useCase: UpdatePostUseCase = new UpdatePostUseCase(postRepository);

  beforeEach(() => {
    postRepository.findById.mockReset();
    postRepository.create.mockReset();
    postRepository.updateAuthorPost.mockReset();
  });

  it('success update post', async () => {
    const post = Post.restore({
      id: 1,
      authorId: 1,
      description: null,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
      images: [],
      version: 0,
      deletedAt: null,
    });
    postRepository.findById.mockResolvedValue(post);

    const command = new UpdatePostCommand({
      authorId: 1,
      postId: 1,
      description: 'update post description',
    });

    await useCase.execute(command);

    expect(postRepository.findById).toHaveBeenCalledWith(post.id);
    expect(postRepository.updateAuthorPost).toHaveBeenCalledWith({
      id: post.id,
      authorId: post.authorId,
      expectedVersion: post.version,
      fields: {
        description: 'update post description',
      },
    });
  });

  it('execution interrupted, post not found', async () => {
    postRepository.findById.mockResolvedValue(null);

    const command = new UpdatePostCommand({
      authorId: 1,
      postId: 1,
      description: 'update post description',
    });

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(PostNotFoundError);

    expect(postRepository.findById).toHaveBeenCalledWith(1);
    expect(postRepository.updateAuthorPost).not.toHaveBeenCalled();
  });

  it('throws PostUpdateForbiddenError when the post belongs to another author', async () => {
    postRepository.findById.mockResolvedValue(
      Post.restore({
        authorId: 2,
        id: 1,
        description: null,
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
        images: [],
        version: 0,
        deletedAt: null,
      }),
    );

    const command = new UpdatePostCommand({
      authorId: 1,
      postId: 1,
      description: 'update post description',
    });

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(PostUpdateForbiddenError);

    expect(postRepository.findById).toHaveBeenCalledWith(1);
    expect(postRepository.updateAuthorPost).not.toHaveBeenCalled();
  });
});
