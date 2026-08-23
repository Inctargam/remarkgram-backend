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
  ImageUploadOperationConflictError,
  ImageUploadNotFoundError,
  ImageUploadsNotAvailableError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { Prisma } from '../generated/client.js';
import { ImageUploadOperationKind } from '../generated/enums.js';
import { PrismaService } from '../prisma.service.js';

type IdempotentImageUploadOperation = {
  operationId: string;
  kind: ImageUploadOperationKind;
  userId: number;
  reservationId: string;
  uploadIds: readonly string[];
};

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
    const { uploadIds, userId, reservationId, operationId, reservationExpiresAt } = params;
    const canonicalUploadIds = [...uploadIds].sort();

    await this.executeIdempotentOperation(
      {
        operationId,
        kind: ImageUploadOperationKind.RESERVE,
        userId,
        reservationId,
        uploadIds: canonicalUploadIds,
      },
      async (tx) => {
        // Условное обновление одновременно проверяет владельца и состояние записей.
        // Если обновится только часть набора, последующая ошибка откатит файлы и запись операции.
        const result = await tx.file.updateMany({
          where: {
            id: { in: canonicalUploadIds },
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

        if (result.count === canonicalUploadIds.length) {
          return;
        }

        // Отдельное чтение отличает отсутствующие, чужие и удалённые записи
        // от существующих записей в несовместимом состоянии.
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
      },
    );
  }

  async releaseReservedImageUploads(params: ReleaseReservedImageUploadsRepositoryParams): Promise<void> {
    const { userId, reservationId, operationId } = params;

    await this.executeIdempotentOperation(
      {
        operationId,
        kind: ImageUploadOperationKind.RELEASE,
        userId,
        reservationId,
        uploadIds: [],
      },
      async (tx) => {
        const uploadIds = await this.findReservationUploadIds(tx, userId, reservationId);
        const result = await tx.file.updateMany({
          where: {
            id: { in: uploadIds },
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

        if (result.count !== uploadIds.length) {
          throw new ImageUploadsNotAvailableError();
        }
      },
    );
  }

  async attachReservedImageUploads(params: AttachReservedImageUploadsRepositoryParams): Promise<void> {
    const { userId, reservationId, operationId } = params;

    await this.executeIdempotentOperation(
      {
        operationId,
        kind: ImageUploadOperationKind.ATTACH,
        userId,
        reservationId,
        uploadIds: [],
      },
      async (tx) => {
        const uploadIds = await this.findReservationUploadIds(tx, userId, reservationId);
        const result = await tx.file.updateMany({
          where: {
            id: { in: uploadIds },
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

        if (result.count !== uploadIds.length) {
          throw new ImageUploadsNotAvailableError();
        }
      },
    );
  }

  private async executeIdempotentOperation(
    operation: IdempotentImageUploadOperation,
    mutate: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Запись операции и изменение файлов фиксируются одной локальной транзакцией.
        // Поэтому наличие такой записи означает, что весь шаг уже завершён.
        await tx.imageUploadOperationReceipt.create({
          data: {
            ...operation,
            uploadIds: [...operation.uploadIds],
          },
        });

        await mutate(tx);
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      // После потерянного gRPC-ответа тот же набор параметров возвращает сохранённый успех.
      // Переиспользование operationId или reservationId для другой команды — конфликт.
      const receipts = await this.prisma.imageUploadOperationReceipt.findMany({
        where: {
          OR: [
            { operationId: operation.operationId },
            { kind: operation.kind, reservationId: operation.reservationId },
          ],
        },
      });

      if (receipts.some((receipt) => this.isExactReplay(receipt, operation))) {
        return;
      }

      throw new ImageUploadOperationConflictError();
    }
  }

  private async findReservationUploadIds(
    tx: Prisma.TransactionClient,
    userId: number,
    reservationId: string,
  ): Promise<string[]> {
    // ATTACH и RELEASE получают точный исходный набор из записи операции RESERVE.
    // Это исключает ложные повторы с подмножеством или расширением uploadIds.
    const reservation = await tx.imageUploadOperationReceipt.findUnique({
      where: {
        kind_reservationId: {
          kind: ImageUploadOperationKind.RESERVE,
          reservationId,
        },
      },
      select: {
        userId: true,
        uploadIds: true,
      },
    });

    if (!reservation || reservation.userId !== userId || reservation.uploadIds.length === 0) {
      throw new ImageUploadsNotAvailableError();
    }

    return reservation.uploadIds;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isExactReplay(
    receipt: {
      operationId: string;
      kind: ImageUploadOperationKind;
      userId: number;
      reservationId: string;
      uploadIds: string[];
    },
    operation: IdempotentImageUploadOperation,
  ): boolean {
    return (
      receipt.operationId === operation.operationId &&
      receipt.kind === operation.kind &&
      receipt.userId === operation.userId &&
      receipt.reservationId === operation.reservationId &&
      receipt.uploadIds.length === operation.uploadIds.length &&
      receipt.uploadIds.every((uploadId, index) => uploadId === operation.uploadIds[index])
    );
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
}
