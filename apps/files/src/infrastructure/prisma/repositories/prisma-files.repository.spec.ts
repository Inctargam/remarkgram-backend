import type { PrismaService } from '../prisma.service.js';
import { InvalidImageUploadStatusError } from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { PrismaFilesRepository } from './prisma-files.repository.js';

describe('PrismaFilesRepository', () => {
  const file = {
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
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
    file.findMany.mockReset();
    file.updateMany.mockReset();
    file.updateMany.mockResolvedValue({ count: 2 });
    file.deleteMany.mockReset();
    file.deleteMany.mockResolvedValue({ count: 1 });
    transaction.mockClear();
  });

  it('creates file records in one query', async () => {
    const fileRecords = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        userId: 42,
        objectKey: 'user/42/images/11111111-1111-4111-8111-111111111111',
        originalFilename: 'first.jpg',
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.PENDING,
        uploadExpiresAt: new Date('2030-01-01T00:00:00Z'),
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        userId: 42,
        objectKey: 'user/42/images/22222222-2222-4222-8222-222222222222',
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
        objectKey: 'user/42/images/first',
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.PENDING,
      },
      {
        id: uploadIds[1],
        objectKey: 'user/42/images/second',
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
