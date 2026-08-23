import { PostIdempotencyKeyConflictError } from '../../../application/errors/create-post.errors.js';
import { PostsErrorCode } from '../../../application/errors/posts.error.js';
import { PostCreationOperationStatus } from '../../../application/types/post-creation-operation.types.js';
import { Prisma } from '../generated/client.js';
import type { PrismaService } from '../prisma.service.js';
import { PrismaPostCreationOperationsRepository } from './prisma-post-creation-operations.repository.js';

describe('PrismaPostCreationOperationsRepository', () => {
  const sagaId = '22222222-2222-4222-8222-222222222222';
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  const reserveOperationId = '44444444-4444-4444-8444-444444444444';
  const attachOperationId = '55555555-5555-4555-8555-555555555555';
  const compensationOperationId = '66666666-6666-4666-8666-666666666666';
  const now = new Date('2030-01-01T00:00:00.000Z');
  const imageIds = ['11111111-1111-4111-8111-111111111111'];
  const create = vi.fn();
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const prisma = {
    postCreationOperation: { create, findUnique, updateMany },
  };
  const repository = new PrismaPostCreationOperationsRepository(prisma as unknown as PrismaService);
  const params = {
    id: sagaId,
    userId: 42,
    idempotencyKey,
    description: 'A new post',
    imageIds,
    reserveOperationId,
    attachOperationId,
    compensationOperationId,
  };
  const row = {
    ...params,
    status: PostCreationOperationStatus.STARTED,
    postId: null,
    version: 0,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue(row);
    findUnique.mockReset();
    updateMany.mockReset();
  });

  it('creates a saga with stable operation IDs', async () => {
    await expect(repository.getOrCreate(params)).resolves.toMatchObject({
      id: sagaId,
      version: 0,
      reserveOperationId,
      attachOperationId,
      compensationOperationId,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        id: sagaId,
        userId: 42,
        idempotencyKey,
        description: 'A new post',
        imageIds,
        reserveOperationId,
        attachOperationId,
        compensationOperationId,
      },
    });
  });

  it('returns the persisted saga for a concurrent request with the same payload', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue(row);

    await expect(
      repository.getOrCreate({
        ...params,
        id: '77777777-7777-4777-8777-777777777777',
        reserveOperationId: '88888888-8888-4888-8888-888888888888',
      }),
    ).resolves.toMatchObject({ id: sagaId, reserveOperationId });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects reuse of a key with another request payload', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue({ ...row, description: 'Different description' });

    await expect(repository.getOrCreate(params)).rejects.toBeInstanceOf(PostIdempotencyKeyConflictError);
  });

  it('does not interpret a random saga ID collision as an HTTP retry', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue(null);

    await expect(repository.getOrCreate(params)).rejects.toBeInstanceOf(PostIdempotencyKeyConflictError);
  });

  it('compares status and version and increments version in one CAS update', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.transition({
        id: sagaId,
        expectedStatus: PostCreationOperationStatus.STARTED,
        expectedVersion: 3,
        status: PostCreationOperationStatus.POST_CREATED,
        postId: 10,
      }),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: sagaId,
        status: PostCreationOperationStatus.STARTED,
        version: 3,
      },
      data: {
        status: PostCreationOperationStatus.POST_CREATED,
        version: { increment: 1 },
        postId: 10,
      },
    });
  });

  it('returns false instead of turning a lost CAS race into a business error', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.transition({
        id: sagaId,
        expectedStatus: PostCreationOperationStatus.POST_CREATED,
        expectedVersion: 1,
        status: PostCreationOperationStatus.COMPLETED,
      }),
    ).resolves.toBe(false);
  });

  it('uses the UnitOfWork transaction client when supplied', async () => {
    const transactionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = { postCreationOperation: { updateMany: transactionUpdateMany } };

    await repository.transition(
      {
        id: sagaId,
        expectedStatus: PostCreationOperationStatus.STARTED,
        expectedVersion: 0,
        status: PostCreationOperationStatus.FAILED,
        failureCode: PostsErrorCode.POST_IMAGE_NOT_FOUND,
      },
      transaction,
    );

    expect(transactionUpdateMany).toHaveBeenCalledOnce();
    expect(updateMany).not.toHaveBeenCalled();
  });

  function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.8.0',
    });
  }
});
