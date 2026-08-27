import { Injectable } from '@nestjs/common';
import {
  FilesRepository,
  type AttachReservedImageUploadsRepositoryParams,
  type ClaimExpiredImageUploadsParams,
  type ClaimedImageUpload,
  type CreateFileRecord,
  type DeleteClaimedImageUploadParams,
  type DeleteRejectedImageUploadsParams,
  type FindAvailableByIdRepositoryParams,
  type FindAvailableByIdRepositoryResult,
  type FindImageUploadsParams,
  type ImageUploadRecord,
  type ReleaseReservedImageUploadsRepositoryParams,
  type ReserveImageUploadsRepositoryParams,
  type UpdateImageUploadsStatusParams,
  type SoftDeleteFileIdsByUserRepositoryResult,
} from '../../../application/ports/files.repository.js';
import {
  ImageUploadNotFoundError,
  ImageUploadReservationConflictError,
  ImageUploadsNotAvailableError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { Prisma } from '../generated/client.js';
import { ImageUploadReservationStatus } from '../generated/enums.js';
import { PrismaService } from '../prisma.service.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';

const haveSameUploadIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((uploadId, index) => uploadId === right[index]);

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

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.file.updateMany({
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
  async reserveImageUploads(params: ReserveImageUploadsRepositoryParams): Promise<void> {
    const { uploadIds, userId, reservationId } = params;
    const canonicalUploadIds = [...uploadIds].sort();

    try {
      await this.prisma.$transaction(async (tx) => {
        const existingReservation = await tx.imageUploadReservation.findUnique({
          where: { id: reservationId },
        });

        if (existingReservation) {
          if (
            existingReservation.userId === userId &&
            haveSameUploadIds(existingReservation.uploadIds, canonicalUploadIds)
          ) {
            // Старый reserve не меняет уже ATTACHED/RELEASED резервацию обратно.
            // Это точный повтор того же durable шага, поэтому он считается успешным.
            return;
          }

          throw new ImageUploadReservationConflictError();
        }

        await tx.imageUploadReservation.create({
          data: {
            id: reservationId,
            userId,
            uploadIds: canonicalUploadIds,
            status: ImageUploadReservationStatus.RESERVED,
          },
        });

        // Агрегат и File меняются одной транзакцией. Несовпадение количества
        // откатывает как частичное обновление файлов, так и саму резервацию.
        const result = await tx.file.updateMany({
          where: {
            id: { in: canonicalUploadIds },
            userId,
            uploadStatus: FileUploadStatus.COMPLETED,
            reservationId: null,
            deletedAt: null,
          },
          data: {
            uploadStatus: FileUploadStatus.RESERVED,
            reservationId,
          },
        });

        if (result.count === canonicalUploadIds.length) {
          return;
        }

        const fileRecords = await tx.file.findMany({
          where: {
            id: { in: canonicalUploadIds },
            userId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (fileRecords.length !== canonicalUploadIds.length) {
          throw new ImageUploadNotFoundError();
        }

        throw new ImageUploadsNotAvailableError();
      });
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      // Конкурентные точные повторы одновременно создают один PK reservationId.
      // После commit победителя принимаем только полностью совпавшую резервацию.
      const reservation = await this.prisma.imageUploadReservation.findUnique({
        where: { id: reservationId },
      });

      if (reservation?.userId !== userId || !haveSameUploadIds(reservation.uploadIds, canonicalUploadIds)) {
        throw new ImageUploadReservationConflictError();
      }
    }
  }

  async releaseReservedImageUploads(params: ReleaseReservedImageUploadsRepositoryParams): Promise<void> {
    const { userId, reservationId } = params;

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.imageUploadReservation.updateMany({
        where: { id: reservationId, userId, status: ImageUploadReservationStatus.RESERVED },
        data: { status: ImageUploadReservationStatus.RELEASED },
      });

      const reservation = await tx.imageUploadReservation.findUnique({
        where: { id: reservationId },
      });

      if (claimed.count === 0) {
        if (reservation?.userId === userId && reservation.status === ImageUploadReservationStatus.RELEASED) {
          return;
        }

        throw new ImageUploadsNotAvailableError();
      }

      if (!reservation) {
        throw new ImageUploadsNotAvailableError();
      }

      const filesResult = await tx.file.updateMany({
        where: {
          id: { in: reservation.uploadIds },
          userId,
          uploadStatus: FileUploadStatus.RESERVED,
          reservationId,
          deletedAt: null,
        },
        data: {
          uploadStatus: FileUploadStatus.COMPLETED,
          reservationId: null,
        },
      });

      if (filesResult.count !== reservation.uploadIds.length) {
        throw new ImageUploadsNotAvailableError();
      }
    });
  }

  async attachReservedImageUploads(params: AttachReservedImageUploadsRepositoryParams): Promise<void> {
    const { userId, reservationId } = params;

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.imageUploadReservation.updateMany({
        where: { id: reservationId, userId, status: ImageUploadReservationStatus.RESERVED },
        data: { status: ImageUploadReservationStatus.ATTACHED },
      });

      const reservation = await tx.imageUploadReservation.findUnique({
        where: { id: reservationId },
      });

      if (claimed.count === 0) {
        if (reservation?.userId === userId && reservation.status === ImageUploadReservationStatus.ATTACHED) {
          return;
        }

        throw new ImageUploadsNotAvailableError();
      }

      if (!reservation) {
        throw new ImageUploadsNotAvailableError();
      }

      const filesResult = await tx.file.updateMany({
        where: {
          id: { in: reservation.uploadIds },
          userId,
          uploadStatus: FileUploadStatus.RESERVED,
          reservationId,
          deletedAt: null,
        },
        data: { uploadStatus: FileUploadStatus.ATTACHED },
      });

      if (filesResult.count !== reservation.uploadIds.length) {
        throw new ImageUploadsNotAvailableError();
      }
    });
  }

  async claimExpiredImageUploads(params: ClaimExpiredImageUploadsParams): Promise<ClaimedImageUpload[]> {
    const { pendingExpiredBefore, completedBefore, rejectedBefore, retryBefore, claimedAt, limit } = params;

    // updateManyAndReturn одновременно выбирает и помечает записи. Поэтому другая реплика
    // не сможет получить те же записи, а старые незавершённые попытки можно забрать повторно.
    // RESERVED здесь намеренно отсутствует: без состояния саги нельзя определить, нужно ли
    // освободить резерв или завершить присоединение к уже созданному посту.
    return this.prisma.file.updateManyAndReturn({
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
      limit,
      select: {
        id: true,
        objectKey: true,
      },
    });
  }

  async deleteClaimedImageUpload(params: DeleteClaimedImageUploadParams): Promise<boolean> {
    const { uploadId, claimedAt } = params;

    const result = await this.prisma.file.deleteMany({
      where: {
        id: uploadId,
        uploadStatus: {
          in: [FileUploadStatus.PENDING, FileUploadStatus.REJECTED, FileUploadStatus.COMPLETED],
        },
        deletedAt: claimedAt,
      },
    });

    return result.count === 1;
  }

  async deleteRejectedImageUploads(params: DeleteRejectedImageUploadsParams): Promise<void> {
    const { uploadIds, userId } = params;

    // Объекты уже удалены из S3. Записи удаляются только если всё ещё принадлежат этой
    // отклонённой попытке и не были захвачены параллельно фоновой очисткой.
    await this.prisma.file.deleteMany({
      where: {
        id: { in: [...uploadIds] },
        userId,
        uploadStatus: FileUploadStatus.REJECTED,
        deletedAt: null,
      },
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
        uploadStatus: { in: [FileUploadStatus.ATTACHED] },
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
