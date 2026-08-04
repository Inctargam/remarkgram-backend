import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH } from '@app/posts-grpc';
import {
  DuplicatePostImageIdError,
  InvalidPostDescriptionError,
  InvalidPostImageCountError,
  InvalidUserIdError,
  PostImageNotCompletedError,
} from '../../errors/create-post.errors.js';
import type { ImageUploadsVerifier } from '../../ports/image-uploads-verifier.js';
import type { PostsRepository } from '../../ports/posts.repository.js';
import { CreatePostCommand, CreatePostUseCase } from './create-post.use-case.js';

describe('CreatePostUseCase', () => {
  const firstImageId = '11111111-1111-4111-8111-111111111111';
  const postsRepository = {
    create: vi.fn<PostsRepository['create']>(),
  };
  const imageUploadsVerifier = {
    ensureCompleted: vi.fn<ImageUploadsVerifier['ensureCompleted']>(),
  };
  const useCase = new CreatePostUseCase(postsRepository, imageUploadsVerifier);

  beforeEach(() => {
    postsRepository.create.mockReset();
    postsRepository.create.mockResolvedValue(10);
    imageUploadsVerifier.ensureCompleted.mockReset();
    imageUploadsVerifier.ensureCompleted.mockResolvedValue();
  });

  it('creates a post after verifying completed images', async () => {
    const command = new CreatePostCommand({
      userId: 42,
      description: 'A new post',
      imageIds: [firstImageId],
    });

    await expect(useCase.execute(command)).resolves.toEqual({ id: 10 });

    expect(imageUploadsVerifier.ensureCompleted).toHaveBeenCalledWith({
      userId: 42,
      imageIds: [firstImageId],
    });
    expect(postsRepository.create).toHaveBeenCalledWith({
      authorId: 42,
      description: 'A new post',
      imageIds: [firstImageId],
    });
    expect(imageUploadsVerifier.ensureCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      postsRepository.create.mock.invocationCallOrder[0],
    );
  });

  it('stores an omitted description as null', async () => {
    await useCase.execute(new CreatePostCommand({ userId: 42, imageIds: [firstImageId] }));

    expect(postsRepository.create).toHaveBeenCalledWith({
      authorId: 42,
      description: null,
      imageIds: [firstImageId],
    });
  });

  it('preserves an empty description', async () => {
    await useCase.execute(new CreatePostCommand({ userId: 42, description: '', imageIds: [firstImageId] }));

    expect(postsRepository.create).toHaveBeenCalledWith({
      authorId: 42,
      description: '',
      imageIds: [firstImageId],
    });
  });

  it.each([0, -1, 2_147_483_648, Number.NaN, 1.5])('rejects invalid user ID %s', async (userId) => {
    await expect(
      useCase.execute(new CreatePostCommand({ userId, imageIds: [firstImageId] })),
    ).rejects.toBeInstanceOf(InvalidUserIdError);

    expect(imageUploadsVerifier.ensureCompleted).not.toHaveBeenCalled();
    expect(postsRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a description longer than 500 characters', async () => {
    await expect(
      useCase.execute(
        new CreatePostCommand({
          userId: 42,
          description: 'a'.repeat(MAX_POST_DESCRIPTION_LENGTH + 1),
          imageIds: [firstImageId],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPostDescriptionError);
  });

  it.each([
    { imageIds: [] },
    {
      imageIds: Array.from({ length: MAX_IMAGES_PER_POST + 1 }, (_, index) => `image-${index}`),
    },
  ])('rejects an invalid image count', async ({ imageIds }) => {
    await expect(useCase.execute(new CreatePostCommand({ userId: 42, imageIds }))).rejects.toBeInstanceOf(
      InvalidPostImageCountError,
    );
  });

  it('rejects duplicate image IDs', async () => {
    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, imageIds: [firstImageId, firstImageId] })),
    ).rejects.toBeInstanceOf(DuplicatePostImageIdError);
  });

  it('does not create a post when image verification fails', async () => {
    const error = new PostImageNotCompletedError();
    imageUploadsVerifier.ensureCompleted.mockRejectedValue(error);

    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, imageIds: [firstImageId] })),
    ).rejects.toBe(error);

    expect(postsRepository.create).not.toHaveBeenCalled();
  });
});
