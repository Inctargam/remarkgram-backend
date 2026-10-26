import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma.service.js';
import {
  ImageUploadNotFoundError,
  PostImageAttachmentConflictError,
  ImageUploadStateConflictError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { PrismaFilesRepository } from './prisma-files.repository.js';

describe('PrismaFilesRepository', () => {
  const file = {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    updateManyAndReturn: vi.fn(),
    count: vi.fn(),
  };
  const postImageAttachmentOperation = { update: vi.fn(), createManyAndReturn: vi.fn() };
  const transactionClient = { file, postImageAttachmentOperation, $queryRaw: vi.fn() };
  const transaction = vi.fn<
    (operation: (client: typeof transactionClient) => Promise<void>) => Promise<void>
  >((operation) => operation(transactionClient));
  const prisma = {
    file,
    postImageAttachmentOperation,
    $transaction: transaction,
    $queryRaw: vi.fn(),
  };
  const repository = new PrismaFilesRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    file.createMany.mockReset();
    file.createMany.mockResolvedValue({ count: 2 });
    file.deleteMany.mockReset();
    file.deleteMany.mockResolvedValue({ count: 1 });
    file.findMany.mockReset();
    file.updateMany.mockReset();
    file.updateMany.mockResolvedValue({ count: 2 });
    file.updateManyAndReturn.mockReset();
    file.updateManyAndReturn.mockResolvedValue([]);
    file.count.mockReset();
    file.count.mockResolvedValue(2);
    postImageAttachmentOperation.update.mockReset();
    postImageAttachmentOperation.createManyAndReturn.mockReset();
    postImageAttachmentOperation.createManyAndReturn.mockResolvedValue([
      { ...operation, status: 'ATTACHED' },
    ]);
    transactionClient.$queryRaw.mockReset();
    transactionClient.$queryRaw.mockResolvedValue([{ ...operation, status: 'ATTACHED' }]);
    transaction.mockClear();
    prisma.$queryRaw.mockReset();
  });

  it('creates file records in one query', async () => {
    const fileRecords = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        userId: 42,
        objectKey: 'users/42/images/11111111-1111-4111-8111-111111111111',
        originalFilename: 'first.jpg',
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.PENDING,
        uploadExpiresAt: new Date('2030-01-01T00:00:00Z'),
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        userId: 42,
        objectKey: 'users/42/images/22222222-2222-4222-8222-222222222222',
        originalFilename: 'second.png',
        contentType: 'image/png',
        size: 2_048,
        uploadStatus: FileUploadStatus.PENDING,
        uploadExpiresAt: new Date('2030-01-01T00:00:00Z'),
      },
    ];

    await repository.createMany(fileRecords);

    expect(file.createMany).toHaveBeenCalledWith({
      data: fileRecords,
    });
  });

  it('finds file records owned by the user', async () => {
    const uploadIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const fileRecords = [
      {
        id: uploadIds[0],
        objectKey: 'users/42/images/first',
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.PENDING,
      },
      {
        id: uploadIds[1],
        objectKey: 'users/42/images/second',
        contentType: 'image/png',
        size: 2_048,
        uploadStatus: FileUploadStatus.PENDING,
      },
    ];
    file.findMany.mockResolvedValue(fileRecords);

    await expect(repository.findImageUploads({ uploadIds, userId: 42 })).resolves.toEqual(fileRecords);
    expect(file.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: uploadIds },
        userId: 42,
        deletedAt: null,
      },
      select: {
        id: true,
        objectKey: true,
        contentType: true,
        size: true,
        uploadStatus: true,
      },
    });
  });

  it('updates all pending image uploads in a transaction', async () => {
    const uploadIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const uploadedAt = new Date('2030-01-01T00:00:00Z');

    await repository.updateImageUploadsStatusIfAllPending({
      uploadIds,
      userId: 42,
      uploadStatus: FileUploadStatus.COMPLETED,
      uploadedAt,
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: uploadIds },
        userId: 42,
        uploadStatus: FileUploadStatus.PENDING,
        deletedAt: null,
      },
      data: {
        uploadStatus: FileUploadStatus.COMPLETED,
        uploadedAt,
      },
    });
  });

  it('rolls back when not all image uploads are pending', async () => {
    file.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.updateImageUploadsStatusIfAllPending({
        uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
        userId: 42,
        uploadStatus: FileUploadStatus.REJECTED,
        uploadedAt: null,
      }),
    ).rejects.toThrow(InvalidImageUploadStatusError);
  });

  it('accepts a concurrent confirmation only when the entire owned batch is completed', async () => {
    file.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repository.updateImageUploadsStatusIfAllPending({
        uploadIds: [firstFileId, secondFileId],
        userId: 42,
        uploadStatus: FileUploadStatus.COMPLETED,
        uploadedAt: new Date(),
      }),
    ).resolves.toBeUndefined();
    expect(file.count).toHaveBeenCalledWith({
      where: {
        id: { in: [firstFileId, secondFileId] },
        userId: 42,
        uploadStatus: FileUploadStatus.COMPLETED,
        deletedAt: null,
      },
    });
  });

  it('rejects confirmation if the batch is still incomplete after rollback', async () => {
    file.updateMany.mockResolvedValue({ count: 1 });
    file.count.mockResolvedValue(1);
    await expect(
      repository.updateImageUploadsStatusIfAllPending({
        uploadIds: [firstFileId, secondFileId],
        userId: 42,
        uploadStatus: FileUploadStatus.COMPLETED,
        uploadedAt: new Date(),
      }),
    ).rejects.toThrow(InvalidImageUploadStatusError);
  });

  it('propagates unexpected database errors', async () => {
    const error = new Error('Database is unavailable');
    file.updateMany.mockRejectedValue(error);

    await expect(
      repository.updateImageUploadsStatusIfAllPending({
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        userId: 42,
        uploadStatus: FileUploadStatus.COMPLETED,
        uploadedAt: new Date(),
      }),
    ).rejects.toBe(error);
  });

  const firstFileId = '11111111-1111-4111-8111-111111111111';
  const secondFileId = '22222222-2222-4222-8222-222222222222';
  const params = {
    userId: 42,
    fileIds: [firstFileId, secondFileId],
    operationId: '33333333-3333-4333-8333-333333333333',
  };
  const operation = {
    id: params.operationId,
    userId: 42,
    fileIdsHash: createHash('sha256').update(params.fileIds.join(',')).digest('hex'),
  };

  it('attaches only completed, unowned files and records the operation', async () => {
    await repository.attachPostImages(params);
    expect(transactionClient.$queryRaw).not.toHaveBeenCalled();
    expect(postImageAttachmentOperation.createManyAndReturn).toHaveBeenCalledWith({
      data: { ...operation, status: 'ATTACHED' },
      skipDuplicates: true,
    });
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: params.fileIds },
        userId: 42,
        uploadStatus: 'COMPLETED',
        postImageAttachmentOperationId: null,
        avatarAttachmentOperationId: null,
        deletedAt: null,
      },
      data: { uploadStatus: 'ATTACHED', postImageAttachmentOperationId: params.operationId },
    });
  });

  it('accepts a successful replay without updating the files again', async () => {
    postImageAttachmentOperation.createManyAndReturn.mockResolvedValueOnce([]);
    await repository.attachPostImages({ ...params, fileIds: [...params.fileIds].reverse() });
    expect(file.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a delayed attach after cancellation', async () => {
    postImageAttachmentOperation.createManyAndReturn.mockResolvedValueOnce([]);
    transactionClient.$queryRaw.mockResolvedValue([{ ...operation, status: 'CANCELLED' }]);
    await expect(repository.attachPostImages(params)).rejects.toThrow(ImageUploadStateConflictError);
    expect(file.updateMany).not.toHaveBeenCalled();
  });

  it.each([{ userId: 43 }, { fileIds: [firstFileId] }])(
    'rejects changed operation parameters: %s',
    async (change) => {
      postImageAttachmentOperation.createManyAndReturn.mockResolvedValueOnce([]);
      await expect(repository.attachPostImages({ ...params, ...change })).rejects.toThrow(
        PostImageAttachmentConflictError,
      );
      expect(file.updateMany).not.toHaveBeenCalled();
    },
  );

  it('reports missing files when the atomic update is incomplete', async () => {
    file.updateMany.mockResolvedValue({ count: 1 });
    file.count.mockResolvedValue(1);
    await expect(repository.attachPostImages(params)).rejects.toThrow(ImageUploadNotFoundError);
  });

  it('reports incompatible file state when all files exist', async () => {
    file.updateMany.mockResolvedValue({ count: 1 });
    await expect(repository.attachPostImages(params)).rejects.toThrow(ImageUploadStateConflictError);
  });

  it('cancels only its own attached, non-deleted files', async () => {
    postImageAttachmentOperation.createManyAndReturn.mockResolvedValueOnce([]);
    await repository.cancelPostImageAttachment(params);
    expect(postImageAttachmentOperation.update).toHaveBeenCalledWith({
      where: { id: params.operationId },
      data: { status: 'CANCELLED' },
    });
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 42,
        postImageAttachmentOperationId: params.operationId,
        uploadStatus: 'ATTACHED',
        deletedAt: null,
      },
      data: { uploadStatus: 'COMPLETED', postImageAttachmentOperationId: null },
    });
  });

  it.each([true, false])(
    'does not touch files when cancellation is already terminal (created: %s)',
    async (created) => {
      postImageAttachmentOperation.createManyAndReturn.mockResolvedValue(
        created ? [{ ...operation, status: 'CANCELLED' }] : [],
      );
      transactionClient.$queryRaw.mockResolvedValue([{ ...operation, status: 'CANCELLED' }]);
      await repository.cancelPostImageAttachment(params);
      expect(file.updateMany).not.toHaveBeenCalled();
    },
  );

  it('returns the uploads atomically claimed by the database', async () => {
    const claimedAt = new Date('2030-01-01T01:00:00Z');
    const claimedImageUploads = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        objectKey: 'users/42/images/first',
      },
    ];
    prisma.$queryRaw.mockResolvedValue(claimedImageUploads);
    await expect(
      repository.claimExpiredImageUploads({
        pendingExpiredBefore: claimedAt,
        rejectedBefore: claimedAt,
        completedBefore: claimedAt,
        retryBefore: claimedAt,
        claimedAt,
        limit: 100,
      }),
    ).resolves.toEqual(claimedImageUploads);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(file.findMany).not.toHaveBeenCalled();
  });

  it('hard-deletes an image upload only while the cleanup claim is still owned', async () => {
    const claimedAt = new Date('2030-01-01T01:00:00Z');

    await expect(
      repository.deleteClaimedImageUpload({
        uploadId: '11111111-1111-4111-8111-111111111111',
        claimedAt,
      }),
    ).resolves.toBe(true);
    expect(file.deleteMany).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        uploadStatus: {
          in: [FileUploadStatus.PENDING, FileUploadStatus.REJECTED, FileUploadStatus.COMPLETED],
        },
        deletedAt: claimedAt,
      },
    });
  });

  it("reports a lost cleanup claim without deleting another worker's record", async () => {
    file.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.deleteClaimedImageUpload({
        uploadId: '11111111-1111-4111-8111-111111111111',
        claimedAt: new Date('2030-01-01T01:00:00Z'),
      }),
    ).resolves.toBe(false);
  });

  it('deletes rejected records after their objects were removed immediately', async () => {
    const uploadIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

    await expect(repository.deleteRejectedImageUploads({ uploadIds, userId: 42 })).resolves.toBeUndefined();

    expect(file.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: uploadIds },
        userId: 42,
        uploadStatus: FileUploadStatus.REJECTED,
        deletedAt: null,
      },
    });
  });
  it('physically deletes only a soft-deleted file through the transaction client', async () => {
    const fileId = '11111111-1111-4111-8111-111111111111';

    await repository.hardDeleteSoftDeletedById(fileId, transactionClient);

    expect(file.deleteMany).toHaveBeenCalledWith({
      where: {
        id: fileId,
        deletedAt: { not: null },
      },
    });
  });
});
