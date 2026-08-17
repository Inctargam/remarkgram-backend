import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH } from '@app/posts-grpc';
import { Logger } from '@nestjs/common';
import {
  DuplicatePostImageIdError,
  InvalidPostDescriptionError,
  InvalidPostImageCountError,
  InvalidUserIdError,
} from '../../errors/create-post.errors.js';
import type { ImageUploadsGateway } from '../../ports/image-uploads.gateway.js';
import { CreatePostCommand, CreatePostUseCase } from './create-post.use-case.js';
import { createPostsRepositoryMock } from '../../../../test/mocks/create-posts-repository.mock.js';

describe('CreatePostUseCase', () => {
  const firstImageId = '11111111-1111-4111-8111-111111111111';
  const reservationId = '22222222-2222-4222-8222-222222222222';
  const postsRepository = createPostsRepositoryMock();
  const imageUploadsGateway = {
    reserveImageUploads: vi.fn<ImageUploadsGateway['reserveImageUploads']>(),
    attachReservedImageUploads: vi.fn<ImageUploadsGateway['attachReservedImageUploads']>(),
    releaseReservedImageUploads: vi.fn<ImageUploadsGateway['releaseReservedImageUploads']>(),
  };
  const useCase = new CreatePostUseCase(postsRepository, imageUploadsGateway);

  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(reservationId);
    postsRepository.create.mockReset();
    postsRepository.create.mockResolvedValue(10);
    imageUploadsGateway.reserveImageUploads.mockReset();
    imageUploadsGateway.reserveImageUploads.mockResolvedValue();
    imageUploadsGateway.attachReservedImageUploads.mockReset();
    imageUploadsGateway.attachReservedImageUploads.mockResolvedValue();
    imageUploadsGateway.releaseReservedImageUploads.mockReset();
    imageUploadsGateway.releaseReservedImageUploads.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reserves image uploads before creating a post', async () => {
    const command = new CreatePostCommand({
      userId: 42,
      description: 'A new post',
      imageIds: [firstImageId],
    });

    await expect(useCase.execute(command)).resolves.toEqual({ id: 10 });

    expect(imageUploadsGateway.reserveImageUploads).toHaveBeenCalledWith({
      userId: 42,
      imageIds: [firstImageId],
      reservationId,
    });
    expect(postsRepository.create).toHaveBeenCalledWith({
      authorId: 42,
      description: 'A new post',
      imageIds: [firstImageId],
    });
    expect(imageUploadsGateway.reserveImageUploads.mock.invocationCallOrder[0]).toBeLessThan(
      postsRepository.create.mock.invocationCallOrder[0],
    );
    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId,
    });
    expect(postsRepository.create.mock.invocationCallOrder[0]).toBeLessThan(
      imageUploadsGateway.attachReservedImageUploads.mock.invocationCallOrder[0],
    );
    expect(imageUploadsGateway.releaseReservedImageUploads).not.toHaveBeenCalled();
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

  it.each([0, -1, Number.NaN, 1.5])('rejects invalid user ID %s', async (userId) => {
    await expect(
      useCase.execute(new CreatePostCommand({ userId, imageIds: [firstImageId] })),
    ).rejects.toBeInstanceOf(InvalidUserIdError);

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

  it('does not create a post when image upload reservation fails', async () => {
    const error = new Error('Image upload reservation failed');
    imageUploadsGateway.reserveImageUploads.mockRejectedValue(error);

    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, imageIds: [firstImageId] })),
    ).rejects.toBe(error);

    expect(postsRepository.create).not.toHaveBeenCalled();
    expect(imageUploadsGateway.attachReservedImageUploads).not.toHaveBeenCalled();
    expect(imageUploadsGateway.releaseReservedImageUploads).not.toHaveBeenCalled();
  });

  it('releases reserved image uploads when post creation fails', async () => {
    const error = new Error('Post creation failed');
    postsRepository.create.mockRejectedValue(error);

    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, imageIds: [firstImageId] })),
    ).rejects.toBe(error);

    expect(imageUploadsGateway.releaseReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId,
    });
    expect(imageUploadsGateway.attachReservedImageUploads).not.toHaveBeenCalled();
  });

  it('preserves the post creation error when reservation release also fails', async () => {
    const creationError = new Error('Post creation failed');
    const releaseError = new Error('Files is unavailable');
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    postsRepository.create.mockRejectedValue(creationError);
    imageUploadsGateway.releaseReservedImageUploads.mockRejectedValue(releaseError);

    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, imageIds: [firstImageId] })),
    ).rejects.toBe(creationError);

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to release image upload reservation after post creation failed',
      { reservationId, error: releaseError },
    );
    expect(imageUploadsGateway.attachReservedImageUploads).not.toHaveBeenCalled();
  });

  it('propagates an attachment failure without releasing images linked to the created post', async () => {
    const error = new Error('Image upload attachment failed');
    imageUploadsGateway.attachReservedImageUploads.mockRejectedValue(error);

    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, imageIds: [firstImageId] })),
    ).rejects.toBe(error);

    expect(postsRepository.create).toHaveBeenCalledOnce();
    expect(imageUploadsGateway.releaseReservedImageUploads).not.toHaveBeenCalled();
  });
});
