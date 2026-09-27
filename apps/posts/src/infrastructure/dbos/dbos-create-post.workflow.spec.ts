import type * as DbosSdk from '@dbos-inc/dbos-sdk';

const dbosMock = vi.hoisted(() => ({
  logger: { error: vi.fn() },
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

vi.mock('@dbos-inc/dbos-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof DbosSdk>()),
  ConfiguredInstance: class ConfiguredInstance {},
  DBOS: dbosMock,
}));

import {
  FilesServiceUnavailableError,
  PostIdempotencyKeyConflictError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { PostsErrorCode } from '../../application/errors/posts.error.js';
import type { FilesGateway } from '../../application/ports/files.gateway.js';
import { Prisma } from '../prisma/generated/client.js';
import type { PostsDbosDataSource } from './posts-dbos.datasource.js';
import { DbosCreatePostWorkflow } from './dbos-create-post.workflow.js';

describe('DbosCreatePostWorkflow', () => {
  const fileIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
  const filesGateway = {
    attachPostImages: vi.fn<FilesGateway['attachPostImages']>(),
    cancelPostImageAttachment: vi.fn<FilesGateway['cancelPostImageAttachment']>(),
  };
  const workflow = new DbosCreatePostWorkflow(dataSource as unknown as PostsDbosDataSource, filesGateway);
  const params = {
    workflowId: 'create-post:42:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    requestHash: 'request-hash',
    userId: 42,
    description: 'A new post',
    fileIds,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(publishedAt);
    dbosMock.startWorkflow.mockClear();
    dbosMock.randomUUID.mockReset();
    dbosMock.randomUUID.mockResolvedValue(operationId);

    dataSource.runTransaction.mockClear();
    post.create.mockReset();
    post.create.mockResolvedValue({ id: 10 });
    post.deleteMany.mockReset();
    post.deleteMany.mockResolvedValue({ count: 1 });
    post.updateMany.mockReset();
    post.updateMany.mockResolvedValue({ count: 1 });

    filesGateway.attachPostImages.mockReset();
    filesGateway.attachPostImages.mockResolvedValue();
    filesGateway.cancelPostImageAttachment.mockReset();
    filesGateway.cancelPostImageAttachment.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an unpublished post, attaches files and publishes', async () => {
    await expect(workflow.execute(params)).resolves.toEqual({ id: 10 });

    expect(dbosMock.startWorkflow).toHaveBeenCalledWith(workflow, {
      workflowID: params.workflowId,
    });
    expect(post.create).toHaveBeenCalledWith({
      data: {
        authorId: 42,
        description: 'A new post',
        publishedAt: null,
        images: {
          create: [
            { fileId: fileIds[0], position: 0 },
            { fileId: fileIds[1], position: 1 },
          ],
        },
      },
      select: { id: true },
    });
    expect(filesGateway.attachPostImages).toHaveBeenCalledWith({
      userId: 42,
      fileIds,
      operationId,
    });
    expect(post.create.mock.invocationCallOrder[0]).toBeLessThan(
      filesGateway.attachPostImages.mock.invocationCallOrder[0],
    );
    expect(filesGateway.attachPostImages.mock.invocationCallOrder[0]).toBeLessThan(
      post.updateMany.mock.invocationCallOrder[0],
    );
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
          getStatus: () => Promise.resolve({ input: [{ ...params, requestHash: 'stored-request-hash' }] }),
          getResult: () => Promise.resolve({ id: 10 }),
        }),
    });

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostIdempotencyKeyConflictError);
  });

  it('does not call Files after a known post image conflict', async () => {
    post.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImageAlreadyAttachedError);
    expect(filesGateway.cancelPostImageAttachment).not.toHaveBeenCalled();
  });

  it('does not call Files after replaying a transaction conflict without code', async () => {
    const replay = Object.assign(new Error('Stored image conflict'), {
      name: 'PostImageAlreadyAttachedError',
    });
    dataSource.runTransaction.mockRejectedValueOnce(replay);

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImageAlreadyAttachedError);

    expect(post.create).not.toHaveBeenCalled();
    expect(filesGateway.cancelPostImageAttachment).not.toHaveBeenCalled();
    expect(filesGateway.attachPostImages).not.toHaveBeenCalled();
  });

  it.each([PostImageNotFoundError, PostImagesNotAvailableError])(
    'compensates a replayed attach rejection: %s',
    async (ErrorType) => {
      const replay = Object.assign(new Error('Stored attach rejection'), { name: ErrorType.name });
      filesGateway.attachPostImages.mockRejectedValueOnce(replay);

      await expect(workflow.execute(params)).rejects.toBeInstanceOf(ErrorType);

      expect(filesGateway.cancelPostImageAttachment).toHaveBeenCalledOnce();
      expect(filesGateway.cancelPostImageAttachment.mock.invocationCallOrder[0]).toBeLessThan(
        post.deleteMany.mock.invocationCallOrder[0],
      );
      expect(post.deleteMany).toHaveBeenCalledWith({ where: { id: 10, publishedAt: null } });
      expect(post.updateMany).not.toHaveBeenCalled();
    },
  );

  it('does not compensate Files unavailability replayed without code', async () => {
    const replay = Object.assign(new Error('Stored transport failure'), {
      name: 'FilesServiceUnavailableError',
    });
    filesGateway.attachPostImages.mockRejectedValueOnce(replay);

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(FilesServiceUnavailableError);

    expect(filesGateway.cancelPostImageAttachment).not.toHaveBeenCalled();
    expect(post.deleteMany).not.toHaveBeenCalled();
    expect(post.updateMany).not.toHaveBeenCalled();
  });

  it('does not compensate an ambiguous local persistence error', async () => {
    const error = new Error('Database connection was lost');
    post.create.mockRejectedValue(error);

    await expect(workflow.execute(params)).rejects.toBe(error);
    expect(filesGateway.cancelPostImageAttachment).not.toHaveBeenCalled();
  });

  it('cancels attachment and deletes the unpublished post after a terminal attach failure', async () => {
    filesGateway.attachPostImages.mockRejectedValue(new PostImagesNotAvailableError());

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImagesNotAvailableError);
    expect(filesGateway.cancelPostImageAttachment).toHaveBeenCalledOnce();
    expect(post.deleteMany).toHaveBeenCalledWith({ where: { id: 10, publishedAt: null } });
    expect(post.updateMany).not.toHaveBeenCalled();
  });

  it('does not compensate an ambiguous infrastructure error', async () => {
    const error = new FilesServiceUnavailableError();
    filesGateway.attachPostImages.mockRejectedValue(error);

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(FilesServiceUnavailableError);
    expect(filesGateway.cancelPostImageAttachment).not.toHaveBeenCalled();
    expect(post.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps the hidden post if cancellation fails', async () => {
    filesGateway.attachPostImages.mockRejectedValue(new PostImagesNotAvailableError());
    filesGateway.cancelPostImageAttachment.mockRejectedValue(new FilesServiceUnavailableError());
    await expect(workflow.execute(params)).rejects.toBeInstanceOf(FilesServiceUnavailableError);
    expect(post.deleteMany).not.toHaveBeenCalled();
  });

  it('does not detach after a publication transaction fails', async () => {
    post.updateMany.mockRejectedValue(new Error('Database unavailable'));
    await expect(workflow.execute(params)).rejects.toThrow('Database unavailable');
    expect(filesGateway.cancelPostImageAttachment).not.toHaveBeenCalled();
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

    await expect(workflow.execute(params)).rejects.toBeInstanceOf(FilesServiceUnavailableError);
  });
});
