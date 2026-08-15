import { beforeEach, describe, expect } from 'vitest';
import { createPostsRepositoryMock } from '../../../../test/mocks/create-posts-repository.mock.js';
import { DeletePostCommand, DeletePostUseCase } from './delete-post.use-case.js';
import { Post } from '../../../domain/entities/post.entity.js';
import { InvalidPostIdError, PostAccessForbiddenError } from '../../errors/base-post.errors.js';
import { InvalidUserIdError } from '../../errors/create-post.errors.js';

describe('UpdatePostHandler', () => {
  const postRepository = createPostsRepositoryMock();
  const useCase: DeletePostUseCase = new DeletePostUseCase(postRepository);

  const post = Post.restore({
    id: 1,
    authorId: 1,
    description: null,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    images: [
      {
        fileId: '42b4c303-8cae-426d-90e0-d6de1879b1c8',
        position: 0,
      },
    ],
    version: 0,
    deletedAt: null,
  });
  beforeEach(() => {
    postRepository.findById.mockReset();
    postRepository.create.mockReset();
    postRepository.updateAuthorPost.mockReset();
    postRepository.softDeleteById.mockReset();
  });

  it('success soft delete post', async () => {
    postRepository.findById.mockResolvedValue(post);
    postRepository.softDeleteById.mockResolvedValue({
      id: post.id,
      authorId: post.authorId,
      imagesIds: post.images.map((i) => i.fileId),
    });
    await expect(
      useCase.execute(
        new DeletePostCommand({
          postId: 1,
          authorId: 1,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(postRepository.findById).toHaveBeenCalledTimes(1);
    expect(postRepository.softDeleteById).toHaveBeenCalledWith({
      id: 1,
      authorId: 1,
    });
  });

  it('repeat call delete to be idempotent', async () => {
    postRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute(
        new DeletePostCommand({
          postId: 2,
          authorId: 1,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(postRepository.findById).toHaveBeenCalledTimes(1);
    expect(postRepository.softDeleteById).not.toHaveBeenCalled();
  });

  it('throws access forbidden error', async () => {
    postRepository.findById.mockResolvedValue(post);
    await expect(
      useCase.execute(
        new DeletePostCommand({
          postId: 1,
          authorId: 2,
        }),
      ),
    ).rejects.toBeInstanceOf(PostAccessForbiddenError);

    expect(postRepository.findById).toHaveBeenCalledTimes(1);
    expect(postRepository.softDeleteById).not.toHaveBeenCalled();
  });

  test.each([
    [
      new DeletePostCommand({
        postId: '1.5' as unknown as number,
        authorId: 1,
      }),
      InvalidPostIdError,
    ],
    [
      new DeletePostCommand({
        postId: 1,
        authorId: '111-111-1111-' as unknown as number,
      }),
      InvalidUserIdError,
    ],
  ])('выбрасывает ожидаемую ошибку при невалидной команде', async (command, ExpectedError) => {
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(ExpectedError);

    expect(postRepository.findById).not.toHaveBeenCalled();
    expect(postRepository.softDeleteById).not.toHaveBeenCalled();
  });
});
