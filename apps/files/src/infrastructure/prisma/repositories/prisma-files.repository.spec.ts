import type { PrismaService } from '../prisma.service.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { PrismaFilesRepository } from './prisma-files.repository.js';

describe('PrismaFilesRepository', () => {
  const prisma = {
    file: {
      createMany: vi.fn(),
    },
  };
  const repository = new PrismaFilesRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    prisma.file.createMany.mockReset();
    prisma.file.createMany.mockResolvedValue({ count: 2 });
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
        uploadedAt: null,
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
        uploadedAt: null,
      },
    ];

    await repository.createMany(fileRecords);

    expect(prisma.file.createMany).toHaveBeenCalledWith({
      data: fileRecords,
    });
  });
});
