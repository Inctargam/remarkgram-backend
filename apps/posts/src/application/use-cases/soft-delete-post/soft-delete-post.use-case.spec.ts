import { beforeEach, describe, expect } from 'vitest';
import { createPostsRepositoryMock } from '../../../../test/mocks/create-posts-repository.mock.js';
import { SoftDeletePostCommand, SoftDeletePostUseCase } from './soft-delete-post.use-case.js';
import { Post } from '../../../domain/entities/post.entity.js';
import { InvalidPostIdError, PostAccessForbiddenError } from '../../errors/base-post.errors.js';
import { InvalidUserIdError } from '../../errors/create-post.errors.js';
import type { TransactionContext, TransactionOptions, UnitOfWork } from '../../ports/unit-of-work.js';
import type { OutboxEventsRepository } from '../../ports/outbox-events.repository.js';
import type { DeletedPostsPublisherWorker } from '../../workers/deleted-posts-publisher.worker.js';
import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';

describe('UpdatePostHandler', () => {
  const postRepository = createPostsRepositoryMock();
  const transactionContext = {};
  const unitOfWorkRunMock =
    vi.fn<
      (
        handler: (ctx: TransactionContext) => Promise<unknown>,
        options?: TransactionOptions,
      ) => Promise<unknown>
    >();

  const unitOfWork: UnitOfWork = {
    run: unitOfWorkRunMock as UnitOfWork['run'],
  };

  const outbox = {
    add: vi.fn<OutboxEventsRepository['add']>(),
    findAvailableBatch: vi.fn<OutboxEventsRepository['findAvailableBatch']>(),
    ensurePublished: vi.fn<OutboxEventsRepository['ensurePublished']>(),
    resolveFailedAttempt: vi.fn<OutboxEventsRepository['resolveFailedAttempt']>(),
  } satisfies OutboxEventsRepository;

  const workerRunMock = vi.fn<() => Promise<void>>();

  const worker = {
    run: workerRunMock,
  } as unknown as DeletedPostsPublisherWorker;

  const useCase = new SoftDeletePostUseCase(postRepository, unitOfWork, outbox, worker);

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
    unitOfWorkRunMock.mockReset();
    unitOfWorkRunMock.mockImplementation(async (handler) => handler(transactionContext));
    outbox.add.mockReset();
    workerRunMock.mockReset();
    workerRunMock.mockResolvedValue(undefined);
  });

  it('success soft delete post', async () => {
    postRepository.findById.mockResolvedValue(post);
    postRepository.softDeleteById.mockResolvedValue({
      id: post.id,
      authorId: post.authorId,
      filedIds: post.images.map((i) => i.fileId),
      deletedAt: new Date('2026-08-19T00:00:00.000Z'),
    });
    await expect(
      useCase.execute(
        new SoftDeletePostCommand({
          postId: 1,
          authorId: 1,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(postRepository.findById).toHaveBeenCalledTimes(1);
    expect(postRepository.softDeleteById).toHaveBeenCalledWith(
      {
        id: 1,
        authorId: 1,
      },
      transactionContext,
    );
    expect(outbox.add).toHaveBeenCalledTimes(1);
    expect(outbox.add).toHaveBeenCalledWith(
      {
        eventId: expect.any(String) as string,
        eventType: POST_DELETED_V1_EVENT_NAME,
        aggregateType: 'post',
        aggregateId: String(post.id),
        data: {
          postId: post.id,
          authorId: post.authorId,
          deletedAt: '2026-08-19T00:00:00.000Z',
          fileIds: ['42b4c303-8cae-426d-90e0-d6de1879b1c8'],
        },
      },
      transactionContext,
    );
    expect(workerRunMock).toHaveBeenCalledTimes(1);
  });

  it('repeat call delete to be idempotent', async () => {
    postRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute(
        new SoftDeletePostCommand({
          postId: 2,
          authorId: 1,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(postRepository.findById).toHaveBeenCalledTimes(1);
    expect(postRepository.softDeleteById).not.toHaveBeenCalled();
    expect(unitOfWorkRunMock).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
    expect(workerRunMock).not.toHaveBeenCalled();
  });

  it('stays idempotent when post disappears before soft delete', async () => {
    postRepository.findById.mockResolvedValue(post);
    postRepository.softDeleteById.mockResolvedValue(null);

    await expect(
      useCase.execute(
        new SoftDeletePostCommand({
          postId: post.id,
          authorId: post.authorId,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(postRepository.softDeleteById).toHaveBeenCalledTimes(1);
    expect(outbox.add).not.toHaveBeenCalled();
    expect(workerRunMock).toHaveBeenCalledTimes(1);
  });

  it('does not start publisher before the transaction has persisted the outbox event', async () => {
    let finishTransaction!: () => void;
    const transactionPending = new Promise<void>((resolve) => {
      finishTransaction = resolve;
    });
    postRepository.findById.mockResolvedValue(post);
    postRepository.softDeleteById.mockResolvedValue({
      id: post.id,
      authorId: post.authorId,
      filedIds: [],
      deletedAt: new Date('2026-08-19T00:00:00.000Z'),
    });
    outbox.add.mockImplementationOnce(async () => transactionPending);

    const execution = useCase.execute(
      new SoftDeletePostCommand({ postId: post.id, authorId: post.authorId }),
    );
    await vi.waitFor(() => expect(outbox.add).toHaveBeenCalledOnce());
    expect(workerRunMock).not.toHaveBeenCalled();

    finishTransaction();
    await execution;

    expect(workerRunMock).toHaveBeenCalledOnce();
  });

  it('throws access forbidden error', async () => {
    postRepository.findById.mockResolvedValue(post);
    await expect(
      useCase.execute(
        new SoftDeletePostCommand({
          postId: 1,
          authorId: 2,
        }),
      ),
    ).rejects.toBeInstanceOf(PostAccessForbiddenError);

    expect(postRepository.findById).toHaveBeenCalledTimes(1);
    expect(postRepository.softDeleteById).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
    expect(workerRunMock).not.toHaveBeenCalled();
  });

  test.each([
    [
      new SoftDeletePostCommand({
        postId: '1.5' as unknown as number,
        authorId: 1,
      }),
      InvalidPostIdError,
    ],
    [
      new SoftDeletePostCommand({
        postId: 1,
        authorId: '111-111-1111-' as unknown as number,
      }),
      InvalidUserIdError,
    ],
  ])('выбрасывает ожидаемую ошибку при невалидной команде', async (command, ExpectedError) => {
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(ExpectedError);

    expect(postRepository.findById).not.toHaveBeenCalled();
    expect(postRepository.softDeleteById).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
    expect(workerRunMock).not.toHaveBeenCalled();
  });
});
