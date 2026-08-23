import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH } from '@app/posts-grpc';
import {
  DuplicatePostImageIdError,
  ImageUploadsServiceUnavailableError,
  InvalidIdempotencyKeyError,
  InvalidPostDescriptionError,
  InvalidPostImageCountError,
  InvalidUserIdError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../errors/create-post.errors.js';
import { PostsErrorCode } from '../../errors/posts.error.js';
import type { ImageUploadsGateway } from '../../ports/image-uploads.gateway.js';
import type { PostCreationOperationsRepository } from '../../ports/post-creation-operations.repository.js';
import type { UnitOfWork } from '../../ports/unit-of-work.js';
import {
  PostCreationOperationStatus,
  type PostCreationOperation,
} from '../../types/post-creation-operation.types.js';
import { createPostsRepositoryMock } from '../../../../test/mocks/create-posts-repository.mock.js';
import { CreatePostCommand, CreatePostUseCase } from './create-post.use-case.js';

describe('CreatePostUseCase', () => {
  const firstImageId = '11111111-1111-4111-8111-111111111111';
  const sagaId = '22222222-2222-4222-8222-222222222222';
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  const reserveOperationId = '44444444-4444-4444-8444-444444444444';
  const attachOperationId = '55555555-5555-4555-8555-555555555555';
  const compensationOperationId = '66666666-6666-4666-8666-666666666666';
  const transactionContext = Symbol('transaction-context');
  const postsRepository = createPostsRepositoryMock();
  const operationsRepository = {
    getOrCreate: vi.fn<PostCreationOperationsRepository['getOrCreate']>(),
    findById: vi.fn<PostCreationOperationsRepository['findById']>(),
    transition: vi.fn<PostCreationOperationsRepository['transition']>(),
  };
  const imageUploadsGateway = {
    reserveImageUploads: vi.fn<ImageUploadsGateway['reserveImageUploads']>(),
    attachReservedImageUploads: vi.fn<ImageUploadsGateway['attachReservedImageUploads']>(),
    releaseReservedImageUploads: vi.fn<ImageUploadsGateway['releaseReservedImageUploads']>(),
  };
  const unitOfWork = {
    run: vi.fn<UnitOfWork['run']>(),
  };
  const useCase = new CreatePostUseCase(
    postsRepository,
    operationsRepository,
    imageUploadsGateway,
    unitOfWork,
  );

  const createOperation = (overrides: Partial<PostCreationOperation> = {}): PostCreationOperation => ({
    id: sagaId,
    userId: 42,
    idempotencyKey,
    description: 'A new post',
    imageIds: [firstImageId],
    status: PostCreationOperationStatus.STARTED,
    postId: null,
    version: 0,
    reserveOperationId,
    attachOperationId,
    compensationOperationId,
    failureCode: null,
    ...overrides,
  });

  const command = (overrides: Partial<ConstructorParameters<typeof CreatePostCommand>[0]> = {}) =>
    new CreatePostCommand({
      userId: 42,
      idempotencyKey,
      description: 'A new post',
      imageIds: [firstImageId],
      ...overrides,
    });

  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(sagaId)
      .mockReturnValueOnce(reserveOperationId)
      .mockReturnValueOnce(attachOperationId)
      .mockReturnValueOnce(compensationOperationId);
    postsRepository.create.mockReset();
    postsRepository.create.mockResolvedValue(10);
    postsRepository.publish.mockReset();
    postsRepository.publish.mockResolvedValue();
    operationsRepository.getOrCreate.mockReset();
    operationsRepository.getOrCreate.mockResolvedValue(createOperation());
    operationsRepository.findById.mockReset();
    operationsRepository.transition.mockReset();
    operationsRepository.transition.mockResolvedValue(true);
    imageUploadsGateway.reserveImageUploads.mockReset();
    imageUploadsGateway.reserveImageUploads.mockResolvedValue();
    imageUploadsGateway.attachReservedImageUploads.mockReset();
    imageUploadsGateway.attachReservedImageUploads.mockResolvedValue();
    imageUploadsGateway.releaseReservedImageUploads.mockReset();
    imageUploadsGateway.releaseReservedImageUploads.mockResolvedValue();
    unitOfWork.run.mockReset();
    unitOfWork.run.mockImplementation((handler) => handler(transactionContext));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists stable step IDs and publishes only after attaching images', async () => {
    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });

    expect(operationsRepository.getOrCreate).toHaveBeenCalledWith({
      id: sagaId,
      userId: 42,
      idempotencyKey,
      description: 'A new post',
      imageIds: [firstImageId],
      reserveOperationId,
      attachOperationId,
      compensationOperationId,
    });
    expect(imageUploadsGateway.reserveImageUploads).toHaveBeenCalledWith({
      userId: 42,
      imageIds: [firstImageId],
      reservationId: sagaId,
      operationId: reserveOperationId,
    });
    expect(postsRepository.create).toHaveBeenCalledWith(
      { authorId: 42, description: 'A new post', imageIds: [firstImageId] },
      transactionContext,
    );
    expect(operationsRepository.transition).toHaveBeenNthCalledWith(
      1,
      {
        id: sagaId,
        expectedStatus: PostCreationOperationStatus.STARTED,
        expectedVersion: 0,
        status: PostCreationOperationStatus.POST_CREATED,
        postId: 10,
      },
      transactionContext,
    );
    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId: sagaId,
      operationId: attachOperationId,
    });
    expect(operationsRepository.transition).toHaveBeenNthCalledWith(
      2,
      {
        id: sagaId,
        expectedStatus: PostCreationOperationStatus.POST_CREATED,
        expectedVersion: 1,
        status: PostCreationOperationStatus.COMPLETED,
      },
      transactionContext,
    );
    expect(postsRepository.publish).toHaveBeenCalledWith(10, transactionContext);
    expect(imageUploadsGateway.reserveImageUploads).toHaveBeenCalledBefore(unitOfWork.run);
    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledBefore(postsRepository.publish);
  });

  it('stores an omitted description as null', async () => {
    operationsRepository.getOrCreate.mockResolvedValue(createOperation({ description: null }));

    await useCase.execute(command({ description: undefined }));

    expect(operationsRepository.getOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
    expect(postsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
      transactionContext,
    );
  });

  it('returns the saved result for a completed retry without side effects', async () => {
    operationsRepository.getOrCreate.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.COMPLETED, version: 2, postId: 10 }),
    );

    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });

    expect(imageUploadsGateway.reserveImageUploads).not.toHaveBeenCalled();
    expect(postsRepository.create).not.toHaveBeenCalled();
    expect(imageUploadsGateway.attachReservedImageUploads).not.toHaveBeenCalled();
  });

  it('recreates the saved business error for a failed retry', async () => {
    operationsRepository.getOrCreate.mockResolvedValue(
      createOperation({
        status: PostCreationOperationStatus.FAILED,
        version: 1,
        failureCode: PostsErrorCode.POST_IMAGE_NOT_FOUND,
      }),
    );

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(PostImageNotFoundError);
    expect(imageUploadsGateway.reserveImageUploads).not.toHaveBeenCalled();
  });

  it('resumes attachment without creating a second post', async () => {
    operationsRepository.getOrCreate.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.POST_CREATED, version: 1, postId: 10 }),
    );

    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });

    expect(imageUploadsGateway.reserveImageUploads).not.toHaveBeenCalled();
    expect(postsRepository.create).not.toHaveBeenCalled();
    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledOnce();
    expect(postsRepository.publish).toHaveBeenCalledOnce();
  });

  it('persists an explicit Files rejection as a terminal failure', async () => {
    imageUploadsGateway.reserveImageUploads.mockRejectedValue(new PostImagesNotAvailableError());

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(PostImagesNotAvailableError);

    expect(operationsRepository.transition).toHaveBeenCalledWith({
      id: sagaId,
      expectedStatus: PostCreationOperationStatus.STARTED,
      expectedVersion: 0,
      status: PostCreationOperationStatus.FAILED,
      failureCode: PostsErrorCode.POST_IMAGES_NOT_AVAILABLE,
    });
    expect(postsRepository.create).not.toHaveBeenCalled();
  });

  it('retries the reserve step with the same operation ID after a timeout', async () => {
    const error = new ImageUploadsServiceUnavailableError();
    imageUploadsGateway.reserveImageUploads.mockRejectedValue(error);
    operationsRepository.findById.mockResolvedValue(createOperation());

    await expect(useCase.execute(command())).rejects.toBe(error);

    vi.restoreAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('77777777-7777-4777-8777-777777777777');
    operationsRepository.getOrCreate.mockResolvedValue(createOperation());
    imageUploadsGateway.reserveImageUploads.mockResolvedValue();

    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });
    expect(imageUploadsGateway.reserveImageUploads).toHaveBeenLastCalledWith(
      expect.objectContaining({ operationId: reserveOperationId }),
    );
  });

  it('continues when another request advances the saga after an ambiguous reserve error', async () => {
    imageUploadsGateway.reserveImageUploads.mockRejectedValue(new ImageUploadsServiceUnavailableError());
    operationsRepository.findById.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.POST_CREATED, version: 1, postId: 10 }),
    );

    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });

    expect(postsRepository.create).not.toHaveBeenCalled();
    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledOnce();
  });

  it('continues from POST_CREATED after a committed local transaction loses its result', async () => {
    const transactionError = new Error('Transaction result was lost');
    unitOfWork.run
      .mockRejectedValueOnce(transactionError)
      .mockImplementationOnce((handler) => handler(transactionContext));
    operationsRepository.findById.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.POST_CREATED, version: 1, postId: 10 }),
    );

    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });

    expect(imageUploadsGateway.releaseReservedImageUploads).not.toHaveBeenCalled();
    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledOnce();
  });

  it('reloads the winner after losing the create transition CAS', async () => {
    operationsRepository.transition.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    operationsRepository.findById.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.POST_CREATED, version: 1, postId: 10 }),
    );

    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });

    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledOnce();
  });

  it('persists terminal compensation before releasing a reservation', async () => {
    const error = new PostImageAlreadyAttachedError();
    postsRepository.create.mockRejectedValue(error);
    operationsRepository.findById.mockResolvedValue(createOperation());

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(PostImageAlreadyAttachedError);

    expect(operationsRepository.transition).toHaveBeenNthCalledWith(1, {
      id: sagaId,
      expectedStatus: PostCreationOperationStatus.STARTED,
      expectedVersion: 0,
      status: PostCreationOperationStatus.COMPENSATION_PENDING,
      failureCode: PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED,
    });
    expect(imageUploadsGateway.releaseReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId: sagaId,
      operationId: compensationOperationId,
    });
    expect(operationsRepository.transition).toHaveBeenNthCalledWith(2, {
      id: sagaId,
      expectedStatus: PostCreationOperationStatus.COMPENSATION_PENDING,
      expectedVersion: 1,
      status: PostCreationOperationStatus.FAILED,
    });
  });

  it('retries pending compensation with its stable operation ID', async () => {
    const error = new ImageUploadsServiceUnavailableError();
    operationsRepository.getOrCreate.mockResolvedValue(
      createOperation({
        status: PostCreationOperationStatus.COMPENSATION_PENDING,
        version: 1,
        failureCode: PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED,
      }),
    );
    imageUploadsGateway.releaseReservedImageUploads.mockRejectedValue(error);
    operationsRepository.findById.mockResolvedValue(
      createOperation({
        status: PostCreationOperationStatus.COMPENSATION_PENDING,
        version: 1,
        failureCode: PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED,
      }),
    );

    await expect(useCase.execute(command())).rejects.toBe(error);
    expect(imageUploadsGateway.releaseReservedImageUploads).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: compensationOperationId }),
    );
  });

  it('returns the saved result when another request wins the final CAS', async () => {
    operationsRepository.getOrCreate.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.POST_CREATED, version: 1, postId: 10 }),
    );
    operationsRepository.transition.mockResolvedValue(false);
    operationsRepository.findById.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.COMPLETED, version: 2, postId: 10 }),
    );

    await expect(useCase.execute(command())).resolves.toEqual({ id: 10 });
    expect(postsRepository.publish).not.toHaveBeenCalled();
  });

  it('keeps an unpublished post recoverable when attachment fails', async () => {
    const error = new Error('Image upload attachment failed');
    operationsRepository.getOrCreate.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.POST_CREATED, version: 1, postId: 10 }),
    );
    operationsRepository.findById.mockResolvedValue(
      createOperation({ status: PostCreationOperationStatus.POST_CREATED, version: 1, postId: 10 }),
    );
    imageUploadsGateway.attachReservedImageUploads.mockRejectedValue(error);

    await expect(useCase.execute(command())).rejects.toBe(error);

    expect(postsRepository.publish).not.toHaveBeenCalled();
    expect(imageUploadsGateway.releaseReservedImageUploads).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, 1.5])('rejects invalid user ID %s before persistence', async (userId) => {
    await expect(useCase.execute(command({ userId }))).rejects.toBeInstanceOf(InvalidUserIdError);
    expect(operationsRepository.getOrCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid idempotency key', async () => {
    await expect(useCase.execute(command({ idempotencyKey: 'not-a-uuid' }))).rejects.toBeInstanceOf(
      InvalidIdempotencyKeyError,
    );
  });

  it('rejects a description longer than 500 characters', async () => {
    await expect(
      useCase.execute(command({ description: 'a'.repeat(MAX_POST_DESCRIPTION_LENGTH + 1) })),
    ).rejects.toBeInstanceOf(InvalidPostDescriptionError);
  });

  it.each([
    { imageIds: [] },
    { imageIds: Array.from({ length: MAX_IMAGES_PER_POST + 1 }, (_, index) => `image-${index}`) },
  ])('rejects an invalid image count', async ({ imageIds }) => {
    await expect(useCase.execute(command({ imageIds }))).rejects.toBeInstanceOf(InvalidPostImageCountError);
  });

  it('rejects duplicate image IDs', async () => {
    await expect(useCase.execute(command({ imageIds: [firstImageId, firstImageId] }))).rejects.toBeInstanceOf(
      DuplicatePostImageIdError,
    );
  });
});
