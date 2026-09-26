import { Injectable } from '@nestjs/common';
import {
  FilesRepository,
  type AttachImageUploadRepositoryParams,
  type ClaimExpiredImageUploadsParams,
  type ClaimedImageUpload,
  type CreateFileRecord,
  type DeleteClaimedImageUploadParams,
  type FindAvailableByIdRepositoryParams,
  type FindAvailableByIdRepositoryResult,
  type ImageUploadsSelection,
  type ImageUploadRecord,
  type ReservationParams,
  type ReserveImageUploadsRepositoryParams,
  type UpdateImageUploadsStatusParams,
  type SoftDeleteFileIdsByUserRepositoryResult,
} from '../../../application/ports/files.repository.js';
import {
  ImageUploadNotFoundError,
  ImageUploadReservationConflictError,
  ImageUploadStateConflictError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { Prisma } from '../generated/client.js';
import { ImageUploadReservationStatus } from '../generated/enums.js';
import { PrismaService } from '../prisma.service.js';
import type { ImageUploadMetadata } from '../../../application/types/image-upload.types.js';
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

  async attachImageUpload(
    { userId, fileId, operationId }: AttachImageUploadRepositoryParams,
    ctx: TransactionContext,
  ): Promise<ImageUploadMetadata | null> {
    const tx = ctx as Prisma.TransactionClient;
    try {
      // Первое прикрепление: атомарно занимаем подтверждённый, свободный файл владельца.
      const [file] = await tx.file.updateManyAndReturn({
        where: {
          id: fileId,
          userId,
          uploadStatus: FileUploadStatus.COMPLETED,
          reservationId: null,
          attachmentOperationId: null,
          deletedAt: null,
        },
        data: { uploadStatus: FileUploadStatus.ATTACHED, attachmentOperationId: operationId },
        select: { size: true, contentType: true },
      });
      // Метаданные проверит use case до фиксации этой же транзакции.
      if (file) return file;
    } catch (error) {
      // Уникальный attachmentOperationId не позволяет прикрепить другой файл тем же ключом.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ImageUploadReservationConflictError();
      }
      throw error;
    }

    // Обновления не было: отличаем точный повтор от отсутствия файла или конфликта состояния.
    const file = await tx.file.findFirst({
      where: { id: fileId, userId },
      select: { uploadStatus: true, attachmentOperationId: true, deletedAt: true },
    });

    // Точный повтор успешен и после soft delete, пока запись файла ещё существует.
    if (file?.uploadStatus === FileUploadStatus.ATTACHED && file.attachmentOperationId === operationId) {
      return null;
    }

    // Отсутствующий, чужой или удалённый файл недоступен владельцу запроса.
    if (!file || file.deletedAt) throw new ImageUploadNotFoundError();
    // Файл найден, но не подтверждён либо занят другой операцией.
    throw new ImageUploadStateConflictError();
  }

  async findImageUploads(params: ImageUploadsSelection): Promise<ImageUploadRecord[]> {
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

        throw new ImageUploadStateConflictError();
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

  async releaseReservedImageUploads(params: ReservationParams): Promise<void> {
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

        throw new ImageUploadStateConflictError();
      }

      if (!reservation) {
        throw new ImageUploadStateConflictError();
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
        throw new ImageUploadStateConflictError();
      }
    });
  }

  async attachReservedImageUploads(params: ReservationParams): Promise<void> {
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

        throw new ImageUploadStateConflictError();
      }

      if (!reservation) {
        throw new ImageUploadStateConflictError();
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
        throw new ImageUploadStateConflictError();
      }
    });
  }

  async claimExpiredImageUploads(params: ClaimExpiredImageUploadsParams): Promise<ClaimedImageUpload[]> {
    const { pendingExpiredBefore, completedBefore, rejectedBefore, retryBefore, claimedAt, limit } = params;

    /*
     * Прежний Prisma-запрос:
     *
     * return this.prisma.file.updateManyAndReturn({
     *   where: {
     *     AND: [
     *       {
     *         OR: [
     *           {
     *             uploadStatus: FileUploadStatus.PENDING,
     *             uploadExpiresAt: { lte: pendingExpiredBefore },
     *           },
     *           {
     *             uploadStatus: FileUploadStatus.REJECTED,
     *             updatedAt: { lte: rejectedBefore },
     *           },
     *           {
     *             uploadStatus: FileUploadStatus.COMPLETED,
     *             uploadedAt: { lte: completedBefore },
     *             reservationId: null,
     *           },
     *         ],
     *       },
     *       {
     *         OR: [{ deletedAt: null }, { deletedAt: { lte: retryBefore } }],
     *       },
     *     ],
     *   },
     *   data: {
     *     deletedAt: claimedAt,
     *   },
     *   limit,
     *   select: {
     *     id: true,
     *     objectKey: true,
     *   },
     * });
     *
     * С limit Prisma генерирует UPDATE ... WHERE id IN (SELECT id ... LIMIT ...).
     * Фильтр статуса находится только в подзапросе, читающем снимок начала запроса.
     * Если UPDATE ждёт конкурентное прикрепление, после ожидания строка уже может
     * быть ATTACHED, но её id всё ещё удовлетворяет внешнему WHERE. Очистка тогда
     * помечает прикреплённый файл удалённым. Атомарность UPDATE эту гонку не исключает.
     *
     * FOR UPDATE в подзапросе удерживает блокировки выбранных строк до конца
     * транзакции: между выбором и UPDATE их нельзя прикрепить. SKIP LOCKED
     * пропускает строки, занятые прикреплением или другим запуском очистки.
     */
    return this.prisma.$queryRaw<ClaimedImageUpload[]>`
      UPDATE files AS file
      SET "deletedAt" = ${claimedAt}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE file.id IN (
        SELECT id
        FROM files
        WHERE (
          ("uploadStatus" = ${FileUploadStatus.PENDING}::"FileUploadStatus"
            AND "uploadExpiresAt" <= ${pendingExpiredBefore})
          OR ("uploadStatus" = ${FileUploadStatus.REJECTED}::"FileUploadStatus"
            AND "updatedAt" <= ${rejectedBefore})
          OR ("uploadStatus" = ${FileUploadStatus.COMPLETED}::"FileUploadStatus"
            AND "uploadedAt" <= ${completedBefore}
            AND "reservationId" IS NULL)
        )
          AND ("deletedAt" IS NULL OR "deletedAt" <= ${retryBefore})
        ORDER BY id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING file.id, file."objectKey";
    `;
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

  async deleteRejectedImageUploads(params: ImageUploadsSelection): Promise<void> {
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

  async softDeleteAttachedFile(
    fileId: string,
    userId: number,
    ctx: TransactionContext,
  ): Promise<SoftDeleteFileIdsByUserRepositoryResult> {
    const client = ctx as Prisma.TransactionClient;
    const files = await client.file.updateManyAndReturn({
      where: { id: fileId, userId, deletedAt: null, uploadStatus: FileUploadStatus.ATTACHED },
      data: { deletedAt: new Date() },
      select: { id: true, objectKey: true, deletedAt: true },
    });
    if (files.length === 0) {
      const existing = await client.file.findFirst({ where: { id: fileId, userId, deletedAt: null } });
      if (existing) throw new ImageUploadStateConflictError();
    }
    return files;
  }
}
