import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH } from '@app/posts-grpc';
import {
  DuplicatePostImageIdError,
  InvalidPostDescriptionError,
  InvalidPostIdempotencyKeyError,
  InvalidPostImageCountError,
  InvalidPostImageIdError,
  InvalidUserIdError,
} from '../../errors/create-post.errors.js';
import type { CreatePostWorkflow } from '../../ports/create-post.workflow.js';
import { CreatePostCommand, CreatePostUseCase } from './create-post.use-case.js';

describe('CreatePostUseCase', () => {
  const imageId = '11111111-1111-4111-8111-111111111111';
  const idempotencyKey = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const normalizedIdempotencyKey = idempotencyKey.toLowerCase();
  const createPostWorkflow = {
    execute: vi.fn<CreatePostWorkflow['execute']>(),
  };
  const useCase = new CreatePostUseCase(createPostWorkflow);

  beforeEach(() => {
    createPostWorkflow.execute.mockReset();
    createPostWorkflow.execute.mockResolvedValue({ id: 10 });
  });

  it('starts one deterministic workflow with a hash of the canonical request', async () => {
    await expect(
      useCase.execute(
        new CreatePostCommand({
          userId: 42,
          idempotencyKey,
          description: 'A new post',
          fileIds: [imageId],
        }),
      ),
    ).resolves.toEqual({ id: 10 });

    const workflowParams = createPostWorkflow.execute.mock.calls[0]?.[0];
    expect(workflowParams).toMatchObject({
      workflowId: `create-post:42:${normalizedIdempotencyKey}`,
      userId: 42,
      description: 'A new post',
      fileIds: [imageId],
    });
    expect(workflowParams?.requestHash).toBe(
      '46c789928170448863287b3275852b1084e2b0874dd9783b549984bf3b9a4211',
    );
  });

  it('normalizes an omitted description to null', async () => {
    await useCase.execute(new CreatePostCommand({ userId: 42, idempotencyKey, fileIds: [imageId] }));

    expect(createPostWorkflow.execute).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it('preserves an empty description', async () => {
    await useCase.execute(
      new CreatePostCommand({ userId: 42, idempotencyKey, description: '', fileIds: [imageId] }),
    );

    expect(createPostWorkflow.execute).toHaveBeenCalledWith(expect.objectContaining({ description: '' }));
  });

  it('normalizes image UUIDs before hashing and starting the workflow', async () => {
    const normalizedImageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await useCase.execute(
      new CreatePostCommand({
        userId: 42,
        idempotencyKey,
        fileIds: [normalizedImageId.toUpperCase()],
      }),
    );

    expect(createPostWorkflow.execute).toHaveBeenCalledWith(
      expect.objectContaining({ fileIds: [normalizedImageId] }),
    );
  });

  it.each([0, -1, Number.NaN, 1.5])('rejects invalid user ID %s', async (userId) => {
    await expect(
      useCase.execute(new CreatePostCommand({ userId, idempotencyKey, fileIds: [imageId] })),
    ).rejects.toBeInstanceOf(InvalidUserIdError);

    expect(createPostWorkflow.execute).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-uuid', '11111111-1111-1111-8111-111111111111'])(
    'rejects invalid Idempotency-Key %s',
    async (invalidKey) => {
      await expect(
        useCase.execute(
          new CreatePostCommand({ userId: 42, idempotencyKey: invalidKey, fileIds: [imageId] }),
        ),
      ).rejects.toBeInstanceOf(InvalidPostIdempotencyKeyError);
    },
  );

  it('rejects a description longer than the policy permits', async () => {
    await expect(
      useCase.execute(
        new CreatePostCommand({
          userId: 42,
          idempotencyKey,
          description: 'a'.repeat(MAX_POST_DESCRIPTION_LENGTH + 1),
          fileIds: [imageId],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPostDescriptionError);
  });

  it.each([[[]], [Array.from({ length: MAX_IMAGES_PER_POST + 1 }, (_, index) => `image-${index}`)]])(
    'rejects an invalid image count',
    async (fileIds) => {
      await expect(
        useCase.execute(new CreatePostCommand({ userId: 42, idempotencyKey, fileIds })),
      ).rejects.toBeInstanceOf(InvalidPostImageCountError);
    },
  );

  it.each([
    '',
    'not-a-uuid',
    '11111111-1111-1111-8111-111111111111',
    '11111111-1111-4111-7111-111111111111',
    '00000000-0000-0000-0000-000000000000',
  ])('rejects invalid file ID %s before starting the workflow', async (invalidFileId) => {
    await expect(
      useCase.execute(
        new CreatePostCommand({
          userId: 42,
          idempotencyKey,
          fileIds: [imageId, invalidFileId],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPostImageIdError);
    expect(createPostWorkflow.execute).not.toHaveBeenCalled();
  });

  it('rejects duplicate image IDs', async () => {
    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, idempotencyKey, fileIds: [imageId, imageId] })),
    ).rejects.toBeInstanceOf(DuplicatePostImageIdError);
  });

  it('treats UUIDs that differ only by letter case as duplicate image IDs', async () => {
    const mixedCaseImageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await expect(
      useCase.execute(
        new CreatePostCommand({
          userId: 42,
          idempotencyKey,
          fileIds: [mixedCaseImageId, mixedCaseImageId.toUpperCase()],
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicatePostImageIdError);
  });

  it('continues the same workflow for an exact retry', async () => {
    const command = new CreatePostCommand({ userId: 42, idempotencyKey, fileIds: [imageId] });

    await expect(Promise.all([useCase.execute(command), useCase.execute(command)])).resolves.toEqual([
      { id: 10 },
      { id: 10 },
    ]);

    const firstWorkflowId = createPostWorkflow.execute.mock.calls[0]?.[0].workflowId;
    const secondWorkflowId = createPostWorkflow.execute.mock.calls[1]?.[0].workflowId;
    expect(firstWorkflowId).toBe(`create-post:42:${normalizedIdempotencyKey}`);
    expect(secondWorkflowId).toBe(firstWorkflowId);
  });

  it('does not transform an error returned by the workflow boundary', async () => {
    const error = new Error('Workflow failed');
    createPostWorkflow.execute.mockRejectedValue(error);

    await expect(
      useCase.execute(new CreatePostCommand({ userId: 42, idempotencyKey, fileIds: [imageId] })),
    ).rejects.toBe(error);
  });

  it('uses different request hashes when image order changes', async () => {
    const secondImageId = '22222222-2222-4222-8222-222222222222';

    await useCase.execute(
      new CreatePostCommand({
        userId: 42,
        idempotencyKey,
        fileIds: [imageId, secondImageId],
      }),
    );
    await useCase.execute(
      new CreatePostCommand({
        userId: 42,
        idempotencyKey,
        fileIds: [secondImageId, imageId],
      }),
    );

    const firstRequestHash = createPostWorkflow.execute.mock.calls[0]?.[0].requestHash;
    const secondRequestHash = createPostWorkflow.execute.mock.calls[1]?.[0].requestHash;
    expect(firstRequestHash).not.toBe(secondRequestHash);
  });
});
