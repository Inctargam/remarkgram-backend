import { Injectable } from '@nestjs/common';
import {
  FilesRepository,
  type CreateFileRecord,
  type FindImageUploadsParams,
  type ImageUploadRecord,
  type UpdateImageUploadsStatusParams,
  FindAvailableByIdRepositoryParams,
  FindAvailableByIdRepositoryResult,
  SoftDeleteFileIdsByUserRepositoryResult,
} from '../../../application/ports/files.repository.js';
import { InvalidImageUploadStatusError } from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { PrismaService } from '../prisma.service.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';
import { Prisma } from '../generated/client.js';

@Injectable()
export class PrismaFilesRepository extends FilesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createMany(fileRecords: readonly CreateFileRecord[]): Promise<void> {
    await this.prisma.file.createMany({
      data: [...fileRecords],
    });
  }

  async findImageUploads(params: FindImageUploadsParams): Promise<ImageUploadRecord[]> {
    const { uploadIds, userId } = params;

    const fileRecords = await this.prisma.file.findMany({
      where: {
        id: { in: [...uploadIds] },
        userId,
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

    return fileRecords.map((fileRecord) => ({
      ...fileRecord,
      uploadStatus: FileUploadStatus[fileRecord.uploadStatus],
    }));
  }

  async updateImageUploadsStatusIfAllPending(params: UpdateImageUploadsStatusParams): Promise<void> {
    const { uploadIds, userId, uploadStatus, uploadedAt } = params;

    await this.prisma.$transaction(async (prisma) => {
      const result = await prisma.file.updateMany({
        where: {
          id: { in: [...uploadIds] },
          userId,
          uploadStatus: FileUploadStatus.PENDING,
          deletedAt: null,
        },
        data: {
          uploadStatus,
          uploadedAt,
        },
      });

      if (result.count !== uploadIds.length) {
        throw new InvalidImageUploadStatusError();
      }
    });
  }
  async findAvailableById(
    params: FindAvailableByIdRepositoryParams,
  ): Promise<FindAvailableByIdRepositoryResult> {
    const { id } = params;
    const file = await this.prisma.file.findFirst({
      where: {
        id,
        deletedAt: null,
        uploadStatus: FileUploadStatus.COMPLETED,
      },
      select: {
        id: true,
        objectKey: true,
        userId: true,
      },
    });
    if (!file) {
      return null;
    }
    return {
      id: file.id,
      userId: file.userId,
      objectKey: file.objectKey,
    };
  }
  async softDeleteFileIdsByUser(
    fileIds: string[],
    userId: number,
    ctx?: TransactionContext,
  ): Promise<SoftDeleteFileIdsByUserRepositoryResult> {
    const client = (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;

    return client.file.updateManyAndReturn({
      where: {
        id: { in: [...fileIds] },
        deletedAt: null,
        userId: Number(userId),
      },
      data: {
        deletedAt: new Date(),
      },
      select: {
        id: true,
        objectKey: true,
        deletedAt: true,
      },
    });
  }

  async hardDeleteSoftDeletedById(fileId: string, ctx?: TransactionContext): Promise<void> {
    const client = (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;

    await client.file.deleteMany({
      where: {
        id: fileId,
        deletedAt: { not: null },
      },
    });
  }
}
