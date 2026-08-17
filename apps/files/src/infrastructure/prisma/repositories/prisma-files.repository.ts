import { Injectable } from '@nestjs/common';
import {
  FilesRepository,
  type AttachReservedImageUploadsRepositoryParams,
  type ClaimExpiredImageUploadsParams,
  type ClaimedImageUpload,
  type CreateFileRecord,
  type DeleteClaimedImageUploadParams,
  type DeleteRejectedImageUploadsParams,
  FindAvailableByIdRepositoryParams,
  FindAvailableByIdRepositoryResult,
  type FindImageUploadsParams,
  type ImageUploadRecord,
  type ReleaseReservedImageUploadsRepositoryParams,
  type ReserveImageUploadsRepositoryParams,
  type UpdateImageUploadsStatusParams,
} from '../../../application/ports/files.repository.js';
import {
  ImageUploadNotFoundError,
  ImageUploadsNotAvailableError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { FileUploadStatus as PrismaFileUploadStatus } from '../generated/enums.js';
import { PrismaService } from '../prisma.service.js';

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
    const { uploadIds, userId, reservationId, reservationExpiresAt } = params;

    await this.prisma.$transaction(async (tx) => {
      // Условное обновление одновременно проверяет владельца и состояние записей.
      // Если обновится только часть набора, последующая ошибка откатит эти изменения.
      const result = await tx.file.updateMany({
        where: {
          id: { in: [...uploadIds] },
          userId,
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

      if (result.count === uploadIds.length) {
        return;
      }

      // Отдельное чтение позволяет отличить отсутствующие, чужие и удалённые записи
      // от существующих записей, которые нельзя резервировать в текущем состоянии.
      const fileRecords = await tx.file.findMany({
        where: {
          id: { in: [...uploadIds] },
          userId,
          deletedAt: null,
        },
        select: {
          uploadStatus: true,
          reservationId: true,
        },
      });

      if (fileRecords.length !== uploadIds.length) {
        throw new ImageUploadNotFoundError();
      }

      // TODO: Вынести дедупликацию в отдельную ImageUploadReservation с сохранённым исходным
      // набором uploadIds и состоянием операции. Текущая проверка только по File не позволяет
      // отличить точный повтор от запроса с тем же reservationId, но меньшим набором файлов.
      // Повтор того же запроса считается успешным. ATTACHED означает, что запоздавший
      // повтор резервирования пришёл уже после следующего шага той же операции.
      const isReservationRetry = fileRecords.every(
        (fileRecord) =>
          fileRecord.reservationId === reservationId &&
          fileRecord.uploadStatus === PrismaFileUploadStatus.RESERVED,
      );

      const isAlreadyAttached = fileRecords.every(
        (fileRecord) =>
          fileRecord.reservationId === reservationId &&
          fileRecord.uploadStatus === PrismaFileUploadStatus.ATTACHED,
      );

      if (result.count === 0 && (isReservationRetry || isAlreadyAttached)) {
        return;
      }

      // Все записи существуют, но хотя бы одна имеет несовместимый статус либо
      // принадлежит другой операции резервирования. Ошибка также откатывает частичное обновление.
      throw new ImageUploadsNotAvailableError();
    });
  }

  async releaseReservedImageUploads(params: ReleaseReservedImageUploadsRepositoryParams): Promise<void> {
    const { userId, reservationId } = params;

    await this.prisma.file.updateMany({
      where: {
        userId,
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
  }

  async attachReservedImageUploads(params: AttachReservedImageUploadsRepositoryParams): Promise<void> {
    const { userId, reservationId } = params;

    await this.prisma.$transaction(async (tx) => {
      // reservationId сохраняется после присоединения: по нему повтор того же шага
      // можно отличить от попытки присоединить чужой или уже освобождённый резерв.
      await tx.file.updateMany({
        where: {
          userId,
          uploadStatus: FileUploadStatus.RESERVED,
          reservationId,
          deletedAt: null,
        },
        data: {
          uploadStatus: FileUploadStatus.ATTACHED,
          reservationExpiresAt: null,
        },
      });

      // Проверка выполняется в той же транзакции. Пустой, удалённый или смешанный набор
      // приводит к ошибке и откату, а полностью ATTACHED набор означает успешный повтор.
      const fileRecords = await tx.file.findMany({
        where: {
          userId,
          reservationId,
        },
        select: {
          uploadStatus: true,
          deletedAt: true,
        },
      });

      const areAllAttached =
        fileRecords.length > 0 &&
        fileRecords.every(
          (fileRecord) =>
            fileRecord.uploadStatus === PrismaFileUploadStatus.ATTACHED && fileRecord.deletedAt === null,
        );

      if (!areAllAttached) {
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
        uploadStatus: { in: [FileUploadStatus.COMPLETED, FileUploadStatus.ATTACHED] },
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
}
