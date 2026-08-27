import type { PrismaService } from '../prisma.service.js';
import {
  ImageUploadNotFoundError,
  ImageUploadReservationConflictError,
  ImageUploadsNotAvailableError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { Prisma } from '../generated/client.js';
import { ImageUploadReservationStatus } from '../generated/enums.js';
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
  const imageUploadReservation = {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  };
  const transactionClient = { file, imageUploadReservation };
  const transaction = vi.fn<
    (operation: (client: typeof transactionClient) => Promise<void>) => Promise<void>
  >((operation) => operation(transactionClient));
  const prisma = {
    file,
    imageUploadReservation,
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
    imageUploadReservation.create.mockReset();
    imageUploadReservation.create.mockResolvedValue({});
    imageUploadReservation.findUnique.mockReset();
    imageUploadReservation.findUnique.mockResolvedValue(null);
    imageUploadReservation.updateMany.mockReset();
    imageUploadReservation.updateMany.mockResolvedValue({ count: 1 });
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

  const firstUploadId = '11111111-1111-4111-8111-111111111111';
  const secondUploadId = '22222222-2222-4222-8222-222222222222';
  const reservationId = '33333333-3333-4333-8333-333333333333';

  const reservedReservation = {
    id: reservationId,
    userId: 42,
    uploadIds: [firstUploadId, secondUploadId],
    status: ImageUploadReservationStatus.RESERVED,
  };

  it('atomically creates a reservation and reserves the canonical file set', async () => {
    await expect(
      repository.reserveImageUploads({
        uploadIds: [secondUploadId, firstUploadId],
        userId: 42,
        reservationId,
      }),
    ).resolves.toBeUndefined();

    expect(imageUploadReservation.create).toHaveBeenCalledWith({
      data: {
        id: reservationId,
        userId: 42,
        uploadIds: [firstUploadId, secondUploadId],
        status: ImageUploadReservationStatus.RESERVED,
      },
    });
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [firstUploadId, secondUploadId] },
        userId: 42,
        uploadStatus: FileUploadStatus.COMPLETED,
        reservationId: null,
        deletedAt: null,
      },
      data: { uploadStatus: FileUploadStatus.RESERVED, reservationId },
    });
  });

  it('accepts an exact reserve replay even after the reservation has advanced', async () => {
    imageUploadReservation.findUnique.mockResolvedValue({
      ...reservedReservation,
      status: ImageUploadReservationStatus.ATTACHED,
    });

    await expect(
      repository.reserveImageUploads({
        uploadIds: [secondUploadId, firstUploadId],
        userId: 42,
        reservationId,
      }),
    ).resolves.toBeUndefined();
    expect(file.updateMany).not.toHaveBeenCalled();
  });

  it('accepts an exact concurrent reserve after the competing transaction commits', async () => {
    imageUploadReservation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(reservedReservation);
    imageUploadReservation.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(
      repository.reserveImageUploads({
        uploadIds: [firstUploadId, secondUploadId],
        userId: 42,
        reservationId,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects reuse of a reservation ID with a different file set', async () => {
    imageUploadReservation.findUnique.mockResolvedValue(reservedReservation);

    await expect(
      repository.reserveImageUploads({
        uploadIds: [firstUploadId],
        userId: 42,
        reservationId,
      }),
    ).rejects.toThrow(ImageUploadReservationConflictError);
  });

  it('rejects reuse of a reservation ID by another user', async () => {
    imageUploadReservation.findUnique.mockResolvedValue(reservedReservation);

    await expect(
      repository.reserveImageUploads({
        uploadIds: [firstUploadId, secondUploadId],
        userId: 43,
        reservationId,
      }),
    ).rejects.toThrow(ImageUploadReservationConflictError);
  });

  it('reports a missing, foreign or deleted file in the requested set', async () => {
    file.updateMany.mockResolvedValue({ count: 1 });
    file.findMany.mockResolvedValue([{ id: firstUploadId }]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: [firstUploadId, secondUploadId],
        userId: 42,
        reservationId,
      }),
    ).rejects.toThrow(ImageUploadNotFoundError);
  });

  it('reports an existing but incompatible file set as unavailable', async () => {
    file.updateMany.mockResolvedValue({ count: 0 });
    file.findMany.mockResolvedValue([{ id: firstUploadId }, { id: secondUploadId }]);

    await expect(
      repository.reserveImageUploads({
        uploadIds: [firstUploadId, secondUploadId],
        userId: 42,
        reservationId,
      }),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it('atomically attaches exactly the files recorded by the reservation', async () => {
    imageUploadReservation.findUnique.mockResolvedValue(reservedReservation);

    await expect(
      repository.attachReservedImageUploads({ userId: 42, reservationId }),
    ).resolves.toBeUndefined();

    expect(imageUploadReservation.updateMany).toHaveBeenCalledWith({
      where: { id: reservationId, userId: 42, status: ImageUploadReservationStatus.RESERVED },
      data: { status: ImageUploadReservationStatus.ATTACHED },
    });
    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: reservedReservation.uploadIds },
        userId: 42,
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
        deletedAt: null,
      },
      data: { uploadStatus: FileUploadStatus.ATTACHED },
    });
  });

  it('accepts an exact attach replay by reservation state', async () => {
    imageUploadReservation.updateMany.mockResolvedValue({ count: 0 });
    imageUploadReservation.findUnique.mockResolvedValue({
      ...reservedReservation,
      status: ImageUploadReservationStatus.ATTACHED,
    });

    await expect(
      repository.attachReservedImageUploads({ userId: 42, reservationId }),
    ).resolves.toBeUndefined();
    expect(file.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back attach when only part of the recorded file set can be updated', async () => {
    imageUploadReservation.findUnique.mockResolvedValue(reservedReservation);
    file.updateMany.mockResolvedValue({ count: 1 });

    await expect(repository.attachReservedImageUploads({ userId: 42, reservationId })).rejects.toThrow(
      ImageUploadsNotAvailableError,
    );
  });

  it('rejects attach after the reservation was released', async () => {
    imageUploadReservation.updateMany.mockResolvedValue({ count: 0 });
    imageUploadReservation.findUnique.mockResolvedValue({
      ...reservedReservation,
      status: ImageUploadReservationStatus.RELEASED,
    });

    await expect(repository.attachReservedImageUploads({ userId: 42, reservationId })).rejects.toThrow(
      ImageUploadsNotAvailableError,
    );
  });

  it('atomically releases exactly the files recorded by the reservation', async () => {
    imageUploadReservation.findUnique.mockResolvedValue(reservedReservation);

    await expect(
      repository.releaseReservedImageUploads({ userId: 42, reservationId }),
    ).resolves.toBeUndefined();

    expect(file.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: reservedReservation.uploadIds },
        userId: 42,
        uploadStatus: FileUploadStatus.RESERVED,
        reservationId,
        deletedAt: null,
      },
      data: { uploadStatus: FileUploadStatus.COMPLETED, reservationId: null },
    });
    expect(imageUploadReservation.updateMany).toHaveBeenCalledWith({
      where: { id: reservationId, userId: 42, status: ImageUploadReservationStatus.RESERVED },
      data: { status: ImageUploadReservationStatus.RELEASED },
    });
  });

  it('accepts an exact release replay by reservation state', async () => {
    imageUploadReservation.updateMany.mockResolvedValue({ count: 0 });
    imageUploadReservation.findUnique.mockResolvedValue({
      ...reservedReservation,
      status: ImageUploadReservationStatus.RELEASED,
    });

    await expect(
      repository.releaseReservedImageUploads({ userId: 42, reservationId }),
    ).resolves.toBeUndefined();
    expect(file.updateMany).not.toHaveBeenCalled();
  });

  it('rejects release after the reservation was attached', async () => {
    imageUploadReservation.updateMany.mockResolvedValue({ count: 0 });
    imageUploadReservation.findUnique.mockResolvedValue({
      ...reservedReservation,
      status: ImageUploadReservationStatus.ATTACHED,
    });

    await expect(repository.releaseReservedImageUploads({ userId: 42, reservationId })).rejects.toThrow(
      ImageUploadsNotAvailableError,
    );
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
