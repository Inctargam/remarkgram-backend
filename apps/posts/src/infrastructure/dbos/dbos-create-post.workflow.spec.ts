const dbosMock = vi.hoisted(() => ({
  workflow: vi.fn(
    () => (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  ),
  step: vi.fn(() => (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
  startWorkflow: vi.fn((workflow: { createPost(input: unknown): Promise<unknown> }) => ({
    createPost: (input: unknown) =>
      Promise.resolve({
        getStatus: () => Promise.resolve({ input: [input] }),
        getResult: () => workflow.createPost(input),
      }),
  })),
  randomUUID: vi.fn<() => Promise<string>>(),
}));

vi.mock('@dbos-inc/dbos-sdk', () => ({
  ConfiguredInstance: class ConfiguredInstance {},
  DBOS: dbosMock,
}));

import {
  ImageUploadsServiceUnavailableError,
  PostIdempotencyKeyConflictError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { PostsErrorCode } from '../../application/errors/posts.error.js';
import type { ImageUploadsGateway } from '../../application/ports/image-uploads.gateway.js';
import { Prisma } from '../prisma/generated/client.js';
import type { PostsDbosDataSource } from './posts-dbos.datasource.js';
import { DbosCreatePostWorkflow } from './dbos-create-post.workflow.js';

describe('DbosCreatePostWorkflow', () => {
  const imageIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const reservationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const publishedAt = new Date('2030-01-01T00:00:00.000Z');
  const post = {
    create: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const dataSource = {
    client: { post },
    runTransaction: vi.fn((callback: () => Promise<unknown>) => callback()),
  };
  const imageUploadsGateway = {
    reserveImageUploads: vi.fn<ImageUploadsGateway['reserveImageUploads']>(),
    attachReservedImageUploads: vi.fn<ImageUploadsGateway['attachReservedImageUploads']>(),
    releaseReservedImageUploads: vi.fn<ImageUploadsGateway['releaseReservedImageUploads']>(),
  };
  const workflow = new DbosCreatePostWorkflow(
    dataSource as unknown as PostsDbosDataSource,
    imageUploadsGateway,
  );
  const params = {
    workflowId: 'create-post:42:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    requestHash: 'request-hash',
    userId: 42,
    description: 'A new post',
    imageIds,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(publishedAt);
    dbosMock.startWorkflow.mockClear();
    dbosMock.randomUUID.mockReset();
    dbosMock.randomUUID.mockResolvedValue(reservationId);

    dataSource.runTransaction.mockClear();
    post.create.mockReset();
    post.create.mockResolvedValue({ id: 10 });
    post.deleteMany.mockReset();
    post.deleteMany.mockResolvedValue({ count: 1 });
    post.updateMany.mockReset();
    post.updateMany.mockResolvedValue({ count: 1 });

    imageUploadsGateway.reserveImageUploads.mockReset();
    imageUploadsGateway.reserveImageUploads.mockResolvedValue();
    imageUploadsGateway.attachReservedImageUploads.mockReset();
    imageUploadsGateway.attachReservedImageUploads.mockResolvedValue();
    imageUploadsGateway.releaseReservedImageUploads.mockReset();
    imageUploadsGateway.releaseReservedImageUploads.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes reserve, unpublished post creation, attach and publish', async () => {
    await expect(workflow.execute(params)).resolves.toEqual({ id: 10 });

    expect(dbosMock.startWorkflow).toHaveBeenCalledWith(workflow, {
      workflowID: params.workflowId,
    });
    expect(imageUploadsGateway.reserveImageUploads).toHaveBeenCalledWith({
      userId: 42,
      imageIds,
      reservationId,
    });
    expect(post.create).toHaveBeenCalledWith({
      data: {
        authorId: 42,
        description: 'A new post',
        publishedAt: null,
        images: {
          create: [
            { fileId: imageIds[0], position: 0 },
            { fileId: imageIds[1], position: 1 },
          ],
        },
      },
      select: { id: true },
    });
    expect(imageUploadsGateway.attachReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId,
    });
    expect(post.updateMany).toHaveBeenCalledWith({
      where: { id: 10, deletedAt: null, publishedAt: null },
      data: { publishedAt },
    });
  });

  it('returns the existing workflow result when its request hash matches', async () => {
    await expect(Promise.all([workflow.execute(params), workflow.execute(params)])).resolves.toEqual([
      { id: 10 },
      { id: 10 },
    ]);
  });

  it('rejects reuse of the workflow ID with another request payload', async () => {
    dbosMock.startWorkflow.mockReturnValueOnce({
      createPost: () =>
        Promise.resolve({
          getStatus: () =>
            Promise.resolve({ input: [{ ...params, requestHash: 'stored-request-hash' }] }),
          getResult: () => Promise.resolve({ id: 10 }),
        }),
    });

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostIdempotencyKeyConflictError);
  });

  it('returns a reserve business error without creating a post', async () => {
    const error = new PostImageNotFoundError();
    imageUploadsGateway.reserveImageUploads.mockRejectedValue(error);

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImageNotFoundError);
    expect(post.create).not.toHaveBeenCalled();
  });

  it('releases the reservation after a known post image conflict', async () => {
    post.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImageAlreadyAttachedError);
    expect(imageUploadsGateway.releaseReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId,
    });
  });

  it('does not compensate an ambiguous local persistence error', async () => {
    const error = new Error('Database connection was lost');
    post.create.mockRejectedValue(error);

    await expect(workflow.execute(params)).rejects.toBe(error);
    expect(imageUploadsGateway.releaseReservedImageUploads).not.toHaveBeenCalled();
  });

  it('releases images and deletes the unpublished post after a terminal attach failure', async () => {
    imageUploadsGateway.attachReservedImageUploads.mockRejectedValue(new PostImagesNotAvailableError());

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImagesNotAvailableError);
    expect(imageUploadsGateway.releaseReservedImageUploads).toHaveBeenCalledOnce();
    expect(post.deleteMany).toHaveBeenCalledWith({ where: { id: 10, publishedAt: null } });
    expect(post.updateMany).not.toHaveBeenCalled();
  });

  it('does not compensate an ambiguous infrastructure error', async () => {
    const error = new ImageUploadsServiceUnavailableError();
    imageUploadsGateway.attachReservedImageUploads.mockRejectedValue(error);

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(ImageUploadsServiceUnavailableError);
    expect(imageUploadsGateway.releaseReservedImageUploads).not.toHaveBeenCalled();
    expect(post.deleteMany).not.toHaveBeenCalled();
  });

  it('restores a persisted application error by its stable code', async () => {
    const storedError = Object.assign(new Error('Stored failure'), {
      code: PostsErrorCode.POST_IMAGES_NOT_AVAILABLE,
    });
    dbosMock.startWorkflow.mockReturnValueOnce({
      createPost: () =>
        Promise.resolve({
          getStatus: () => Promise.resolve({ input: [params] }),
          getResult: () => Promise.reject(storedError),
        }),
    });

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImagesNotAvailableError);
  });

  it('restores a persisted service-unavailable error', async () => {
    const storedError = Object.assign(new Error('Stored failure'), {
      code: PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE,
    });
    dbosMock.startWorkflow.mockReturnValueOnce({
      createPost: () =>
        Promise.resolve({
          getStatus: () => Promise.resolve({ input: [params] }),
          getResult: () => Promise.reject(storedError),
        }),
    });

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(ImageUploadsServiceUnavailableError);
  });
});
