import type { PrismaService } from '../prisma.service.js';
import {
  ImageUploadOperationConflictError,
  ImageUploadNotFoundError,
  ImageUploadsNotAvailableError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { Prisma } from '../generated/client.js';
import { ImageUploadOperationKind } from '../generated/enums.js';
import { PrismaFilesRepository } from './prisma-files.repository.js';

const uniqueConstraintError = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
  });

describe('PrismaFilesRepository', () => {
  const file = {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    updateManyAndReturn: vi.fn(),
  };
  const imageUploadOperationReceipt = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };
  const transactionClient = { file, imageUploadOperationReceipt };
  const transaction = vi.fn<
    (operation: (client: typeof transactionClient) => Promise<void>) => Promise<void>
  >((operation) => operation(transactionClient));
  const prisma = {
    file,
    imageUploadOperationReceipt,
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
    imageUploadOperationReceipt.create.mockReset();
    imageUploadOperationReceipt.create.mockResolvedValue({});
    imageUploadOperationReceipt.findMany.mockReset();
    imageUploadOperationReceipt.findMany.mockResolvedValue([]);
    imageUploadOperationReceipt.findUnique.mockReset();
    imageUploadOperationReceipt.findUnique.mockResolvedValue({
      userId: 42,
      uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    });
    transaction.mockReset();
    transaction.mockImplementation((operation) => operation(transactionClient));
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

  it('atomically stores the receipt and reserves the canonical upload set', async () => {
    const uploadIds = ['22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'];
    const canonicalUploadIds = [...uploadIds].sort();
    const reservationExpiresAt = new Date('2030-01-01T00:05:00Z');
    const reservationId = '33333333-3333-4333-8333-333333333333';
    const operationId = '44444444-4444-4444-8444-444444444444';

    await expect(
      repository.reserveImageUploads({
        uploadIds,
        userId: 42,
        reservationId,
        operationId,
        reservationExpiresAt,
      }),
    ).resolves.toBeUndefined();

    expect(imageUploadOperationReceipt.create).toHaveBeenCalledWith({
      data: {
        operationId,
        kind: ImageUploadOperationKind.RESERVE,
        userId: 42,
        reservationId,
        uploadIds: canonicalUploadIds,
      },
    });
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: canonicalUploadIds },
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
  });

  it('reports image uploads as missing and rolls the receipt back with the transaction', async () => {
    file.updateMany.mockResolvedValue({ count: 1 });
    file.findMany.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111' }]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        operationId: '44444444-4444-4444-8444-444444444444',
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).rejects.toThrow(ImageUploadNotFoundError);

    expect(imageUploadOperationReceipt.create).toHaveBeenCalledOnce();
  });

  it('rejects an existing upload set in an incompatible state', async () => {
    file.updateMany.mockResolvedValue({ count: 0 });
    file.findMany.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111' }]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        operationId: '44444444-4444-4444-8444-444444444444',
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it('returns success for an exact replay after a unique receipt conflict', async () => {
    const operation = {
      uploadIds: ['22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'],
      userId: 42,
      reservationId: '33333333-3333-4333-8333-333333333333',
      operationId: '44444444-4444-4444-8444-444444444444',
      reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
    };
    transaction.mockRejectedValueOnce(uniqueConstraintError());
    imageUploadOperationReceipt.findMany.mockResolvedValue([
      {
        operationId: operation.operationId,
        kind: ImageUploadOperationKind.RESERVE,
        userId: operation.userId,
        reservationId: operation.reservationId,
        uploadIds: [...operation.uploadIds].sort(),
      },
    ]);

    await expect(repository.reserveImageUploads(operation)).resolves.toBeUndefined();
    expect(file.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      variant: 'subset',
      uploadIds: ['11111111-1111-4111-8111-111111111111'],
    },
    {
      variant: 'disjoint set',
      uploadIds: ['66666666-6666-4666-8666-666666666666'],
    },
  ])('rejects reuse of a reservation for a different $variant', async ({ uploadIds }) => {
    transaction.mockRejectedValueOnce(uniqueConstraintError());
    imageUploadOperationReceipt.findMany.mockResolvedValue([
      {
        operationId: '55555555-5555-4555-8555-555555555555',
        kind: ImageUploadOperationKind.RESERVE,
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        uploadIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      },
    ]);

    await expect(
      repository.reserveImageUploads({
        uploadIds,
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        operationId: '44444444-4444-4444-8444-444444444444',
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).rejects.toThrow(ImageUploadOperationConflictError);
  });

  it('rejects reuse of the operation ID for a different reservation', async () => {
    transaction.mockRejectedValueOnce(uniqueConstraintError());
    imageUploadOperationReceipt.findMany.mockResolvedValue([
      {
        operationId: '44444444-4444-4444-8444-444444444444',
        kind: ImageUploadOperationKind.RESERVE,
        userId: 42,
        reservationId: '55555555-5555-4555-8555-555555555555',
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
      },
    ]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        operationId: '44444444-4444-4444-8444-444444444444',
        reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
      }),
    ).rejects.toThrow(ImageUploadOperationConflictError);
  });

  it('attaches exactly the files recorded by the reserve operation', async () => {
    const reservationId = '33333333-3333-4333-8333-333333333333';
    const operationId = '44444444-4444-4444-8444-444444444444';
    const uploadIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    imageUploadOperationReceipt.findUnique.mockResolvedValue({ userId: 42, uploadIds });

    await expect(
      repository.attachReservedImageUploads({ userId: 42, reservationId, operationId }),
    ).resolves.toBeUndefined();

    expect(imageUploadOperationReceipt.create).toHaveBeenCalledWith({
      data: {
        operationId,
        kind: ImageUploadOperationKind.ATTACH,
        userId: 42,
        reservationId,
        uploadIds: [],
      },
    });
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: uploadIds },
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
  });

  it('releases exactly the files recorded by the reserve operation', async () => {
    const reservationId = '33333333-3333-4333-8333-333333333333';
    const operationId = '44444444-4444-4444-8444-444444444444';
    const uploadIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    imageUploadOperationReceipt.findUnique.mockResolvedValue({ userId: 42, uploadIds });

    await expect(
      repository.releaseReservedImageUploads({ userId: 42, reservationId, operationId }),
    ).resolves.toBeUndefined();

    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: uploadIds },
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

  it('rejects attach when no successful reserve receipt exists', async () => {
    imageUploadOperationReceipt.findUnique.mockResolvedValue(null);

    await expect(
      repository.attachReservedImageUploads({
        userId: 42,
        reservationId: '33333333-3333-4333-8333-333333333333',
        operationId: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it('returns success for an exact attach replay without mutating files again', async () => {
    const operation = {
      userId: 42,
      reservationId: '33333333-3333-4333-8333-333333333333',
      operationId: '44444444-4444-4444-8444-444444444444',
    };
    transaction.mockRejectedValueOnce(uniqueConstraintError());
    imageUploadOperationReceipt.findMany.mockResolvedValue([
      {
        ...operation,
        kind: ImageUploadOperationKind.ATTACH,
        uploadIds: [],
      },
    ]);

    await expect(repository.attachReservedImageUploads(operation)).resolves.toBeUndefined();
    expect(file.updateMany).not.toHaveBeenCalled();
  });

  it('returns success for an exact release replay without mutating files again', async () => {
    const operation = {
      userId: 42,
      reservationId: '33333333-3333-4333-8333-333333333333',
      operationId: '44444444-4444-4444-8444-444444444444',
    };
    transaction.mockRejectedValueOnce(uniqueConstraintError());
    imageUploadOperationReceipt.findMany.mockResolvedValue([
      {
        ...operation,
        kind: ImageUploadOperationKind.RELEASE,
        uploadIds: [],
      },
    ]);

    await expect(repository.releaseReservedImageUploads(operation)).resolves.toBeUndefined();
    expect(file.updateMany).not.toHaveBeenCalled();
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
});
