import type { PrismaService } from '../prisma.service.js';
import {
  ImageUploadNotFoundError,
  ImageUploadsNotAvailableError,
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
    deleteMany: vi.fn(),
  };
  const transactionClient = { file };
  const transaction = vi.fn<
    (operation: (client: typeof transactionClient) => Promise<void>) => Promise<void>
  >((operation) => operation(transactionClient));
  const prisma = {
    file,
    $transaction: transaction,
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
    transaction.mockClear();
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

  it('atomically reserves all completed image uploads', async () => {
    const uploadIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const reservationExpiresAt = new Date('2030-01-01T00:05:00Z');
    const reservationId = '33333333-3333-4333-8333-333333333333';

    await expect(
      repository.reserveImageUploads({
        uploadIds,
        userId: 42,
        reservationId,
        reservationExpiresAt,
      }),
    ).resolves.toBeUndefined();

    expect(transaction).toHaveBeenCalledOnce();
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: uploadIds },
        userId: 42,
        uploadStatus: FileUploadStatus.COMPLETED,
        reservationId: null,
        reservationExpiresAt: null,
        deletedAt: null,
      },
      data: {
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
        reservationExpiresAt,
      },
    });
    expect(file.findMany).not.toHaveBeenCalled();
  });

  it('treats a reservation owned by the same operation as successful', async () => {
    const reservationId = '33333333-3333-4333-8333-333333333333';
    file.updateMany.mockResolvedValue({ count: 0 });
    file.findMany.mockResolvedValue([
      {
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
      },
    ]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        userId: 42,
        reservationId,
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).resolves.toBeUndefined();
  });

  it('treats uploads already attached by the same operation as successful', async () => {
    const reservationId = '33333333-3333-4333-8333-333333333333';
    file.updateMany.mockResolvedValue({ count: 0 });
    file.findMany.mockResolvedValue([
      {
        uploadStatus: FileUploadStatus.ATTACHED,
        reservationId,
      },
    ]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        userId: 42,
        reservationId,
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a mixed set instead of treating a partial update as an idempotent retry', async () => {
    const reservationId = '33333333-3333-4333-8333-333333333333';
    const reservationExpiresAt = new Date('2030-01-01T00:05:00Z');
    file.updateMany.mockResolvedValue({ count: 1 });
    file.findMany.mockResolvedValue([
      {
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
        reservationExpiresAt,
      },
      {
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
        reservationExpiresAt,
      },
    ]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
        userId: 42,
        reservationId,
        reservationExpiresAt,
      }),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it('reports image uploads as missing when the complete owned set cannot be found', async () => {
    file.updateMany.mockResolvedValue({ count: 1 });
    file.findMany.mockResolvedValue([
      {
        uploadStatus: FileUploadStatus.COMPLETED,
        reservationId: null,
        reservationExpiresAt: null,
      },
    ]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).rejects.toThrow(ImageUploadNotFoundError);
  });

  it.each([
    {
      uploadStatus: FileUploadStatus.PENDING,
      reservationId: null,
    },
    {
      uploadStatus: FileUploadStatus.REJECTED,
      reservationId: null,
    },
    {
      uploadStatus: FileUploadStatus.RESERVED,
      reservationId: '44444444-4444-4444-8444-444444444444',
    },
    {
      uploadStatus: FileUploadStatus.ATTACHED,
      reservationId: '44444444-4444-4444-8444-444444444444',
    },
  ])('reports $uploadStatus uploads outside the current reservation as unavailable', async (fileRecord) => {
    file.updateMany.mockResolvedValue({ count: 0 });
    file.findMany.mockResolvedValue([fileRecord]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it('propagates an unexpected reservation update error', async () => {
    const error = new Error('Database is unavailable');
    file.updateMany.mockRejectedValue(error);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).rejects.toBe(error);
    expect(file.findMany).not.toHaveBeenCalled();
  });

  it('releases only image uploads reserved by the same user and operation', async () => {
    const reservationId = '33333333-3333-4333-8333-333333333333';

    await expect(
      repository.releaseReservedImageUploads({ userId: 42, reservationId }),
    ).resolves.toBeUndefined();

    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 42,
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
        deletedAt: null,
      },
      data: {
        uploadStatus: FileUploadStatus.COMPLETED,
        reservationId: null,
        reservationExpiresAt: null,
      },
    });
  });

  it('treats release of an absent or already released reservation as successful', async () => {
    file.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.releaseReservedImageUploads({
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toBeUndefined();
  });

  it('atomically marks every image upload in the reservation as attached', async () => {
    const reservationId = '33333333-3333-4333-8333-333333333333';
    file.findMany.mockResolvedValue([
      { uploadStatus: FileUploadStatus.ATTACHED, deletedAt: null },
      { uploadStatus: FileUploadStatus.ATTACHED, deletedAt: null },
    ]);

    await expect(
      repository.attachReservedImageUploads({ userId: 42, reservationId }),
    ).resolves.toBeUndefined();

    expect(transaction).toHaveBeenCalledOnce();
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 42,
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
        deletedAt: null,
      },
      data: {
        uploadStatus: FileUploadStatus.ATTACHED,
        reservationExpiresAt: null,
      },
    });
    expect(file.findMany).toHaveBeenCalledWith({
      where: {
        userId: 42,
        reservationId,
      },
      select: {
        uploadStatus: true,
        deletedAt: true,
      },
    });
  });

  it('treats attachment of an already attached reservation as successful', async () => {
    file.updateMany.mockResolvedValue({ count: 0 });
    file.findMany.mockResolvedValue([{ uploadStatus: FileUploadStatus.ATTACHED, deletedAt: null }]);

    await expect(
      repository.attachReservedImageUploads({
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    { fileRecords: [] },
    { fileRecords: [{ uploadStatus: FileUploadStatus.RESERVED, deletedAt: null }] },
    {
      fileRecords: [{ uploadStatus: FileUploadStatus.ATTACHED, deletedAt: new Date('2030-01-01T00:00:00Z') }],
    },
  ])('rejects an incomplete or unavailable attachment set', async ({ fileRecords }) => {
    file.updateMany.mockResolvedValue({ count: 0 });
    file.findMany.mockResolvedValue(fileRecords);

    await expect(
      repository.attachReservedImageUploads({
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it('atomically claims image uploads eligible for cleanup', async () => {
    const pendingExpiredBefore = new Date('2030-01-01T00:45:00Z');
    const rejectedBefore = new Date('2030-01-01T00:45:00Z');
    const completedBefore = new Date('2029-12-31T01:00:00Z');
    const retryBefore = new Date('2030-01-01T00:00:00Z');
    const claimedAt = new Date('2030-01-01T01:00:00Z');
    const claimedImageUploads = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        objectKey: 'users/42/images/first',
      },
    ];
    file.updateManyAndReturn.mockResolvedValue(claimedImageUploads);

    await expect(
      repository.claimExpiredImageUploads({
        pendingExpiredBefore,
        rejectedBefore,
        completedBefore,
        retryBefore,
        claimedAt,
        limit: 100,
      }),
    ).resolves.toEqual(claimedImageUploads);
    expect(file.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              {
                uploadStatus: FileUploadStatus.PENDING,
                uploadExpiresAt: { lte: pendingExpiredBefore },
              },
              {
                uploadStatus: FileUploadStatus.REJECTED,
                updatedAt: { lte: rejectedBefore },
              },
              {
                uploadStatus: FileUploadStatus.COMPLETED,
                uploadedAt: { lte: completedBefore },
                reservationId: null,
              },
            ],
          },
          {
            OR: [{ deletedAt: null }, { deletedAt: { lte: retryBefore } }],
          },
        ],
      },
      data: {
        deletedAt: claimedAt,
      },
      limit: 100,
      select: {
        id: true,
        objectKey: true,
      },
    });
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
