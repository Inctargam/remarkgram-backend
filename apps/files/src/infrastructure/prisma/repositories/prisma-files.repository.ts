import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  FilesRepository,
  type AttachAvatarFileRepositoryParams,
  type ClaimExpiredImageUploadsParams,
  type ClaimedImageUpload,
  type CreateFileRecord,
  type DeleteClaimedImageUploadParams,
  type FindAvailableByIdRepositoryParams,
  type FindAvailableByIdRepositoryResult,
  type ImageUploadsSelection,
  type ImageUploadRecord,
  type PostImageAttachmentParams,
  type UpdateImageUploadsStatusParams,
  type SoftDeleteFileIdsByUserRepositoryResult,
} from '../../../application/ports/files.repository.js';
import {
  ImageUploadNotFoundError,
  AvatarAttachmentOperationConflictError,
  PostImageAttachmentConflictError,
  ImageUploadStateConflictError,
  InvalidImageUploadStatusError,
} from '../../../application/errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { Prisma } from '../generated/client.js';
import type { PostImageAttachmentOperation, PostImageAttachmentStatus } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';
import type { ImageUploadMetadata } from '../../../application/types/image-upload.types.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';

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

  async attachAvatarFile(
    { userId, fileId, operationId }: AttachAvatarFileRepositoryParams,
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
          postImageAttachmentOperationId: null,
          avatarAttachmentOperationId: null,
          deletedAt: null,
        },
        data: { uploadStatus: FileUploadStatus.ATTACHED, avatarAttachmentOperationId: operationId },
        select: { size: true, contentType: true },
      });
      // Метаданные проверит use case до фиксации этой же транзакции.
      if (file) return file;
    } catch (error) {
      // Уникальный avatarAttachmentOperationId не позволяет прикрепить другой файл тем же ключом.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AvatarAttachmentOperationConflictError();
      }
      throw error;
    }

    // Обновления не было: отличаем точный повтор от отсутствия файла или конфликта состояния.
    const file = await tx.file.findFirst({
      where: { id: fileId, userId },
      select: { uploadStatus: true, avatarAttachmentOperationId: true, deletedAt: true },
    });

    // Точный повтор успешен и после soft delete, пока запись файла ещё существует.
    if (
      file?.uploadStatus === FileUploadStatus.ATTACHED &&
      file.avatarAttachmentOperationId === operationId
    ) {
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

    try {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.file.updateMany({
          where: {
            id: { in: [...uploadIds] },
            userId,
            uploadStatus: FileUploadStatus.PENDING,
            deletedAt: null,
          },
          data: { uploadStatus, uploadedAt },
        });

        if (result.count !== uploadIds.length) throw new InvalidImageUploadStatusError();
      });
    } catch (error) {
      if (!(error instanceof InvalidImageUploadStatusError) || uploadStatus !== FileUploadStatus.COMPLETED) {
        throw error;
      }
      // После отката частичного UPDATE проверяем, не подтвердил ли весь набор другой запрос.
      const completed = await this.prisma.file.count({
        where: {
          id: { in: [...uploadIds] },
          userId,
          uploadStatus: FileUploadStatus.COMPLETED,
          deletedAt: null,
        },
      });
      if (completed !== uploadIds.length) throw error;
    }
  }

  async attachPostImages(params: PostImageAttachmentParams): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { operation, created } = await this.getOrCreatePostImageAttachmentOperation(
        tx,
        params,
        'ATTACHED',
      );
      if (operation.status === 'CANCELLED') throw new ImageUploadStateConflictError();
      // Повтор возвращает прежний успех, даже если файлы позже были удалены.
      if (!created) return;

      const result = await tx.file.updateMany({
        where: {
          id: { in: [...params.fileIds] },
          userId: params.userId,
          uploadStatus: FileUploadStatus.COMPLETED,
          postImageAttachmentOperationId: null,
          avatarAttachmentOperationId: null,
          deletedAt: null,
        },
        data: {
          uploadStatus: FileUploadStatus.ATTACHED,
          postImageAttachmentOperationId: params.operationId,
        },
      });
      if (result.count === params.fileIds.length) return;

      const available = await tx.file.count({
        where: { id: { in: [...params.fileIds] }, userId: params.userId, deletedAt: null },
      });
      // Исключение откатывает и частичное прикрепление, и новую запись операции.
      if (available !== params.fileIds.length) throw new ImageUploadNotFoundError();
      throw new ImageUploadStateConflictError();
    });
  }

  async cancelPostImageAttachment(params: PostImageAttachmentParams): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { operation } = await this.getOrCreatePostImageAttachmentOperation(tx, params, 'CANCELLED');
      // Включая отмену до первого Attach: маркер запрещает запоздавшую команду.
      if (operation.status === 'CANCELLED') return;

      await tx.postImageAttachmentOperation.update({
        where: { id: params.operationId },
        data: { status: 'CANCELLED' },
      });
      await tx.file.updateMany({
        where: {
          userId: params.userId,
          postImageAttachmentOperationId: params.operationId,
          uploadStatus: FileUploadStatus.ATTACHED,
          deletedAt: null,
        },
        data: { uploadStatus: FileUploadStatus.COMPLETED, postImageAttachmentOperationId: null },
      });
    });
  }

  // Создаёт операцию или блокирует существующую и проверяет совпадение параметров.
  private async getOrCreatePostImageAttachmentOperation(
    tx: Prisma.TransactionClient,
    params: PostImageAttachmentParams,
    initialStatus: PostImageAttachmentStatus,
  ): Promise<{ operation: PostImageAttachmentOperation; created: boolean }> {
    const fileIdsHash = createHash('sha256')
      .update(
        params.fileIds
          .map((id) => id.toLowerCase())
          .sort()
          .join(','),
      )
      .digest('hex');
    const [inserted] = await tx.postImageAttachmentOperation.createManyAndReturn({
      data: {
        id: params.operationId,
        userId: params.userId,
        fileIdsHash,
        status: initialStatus,
      },
      skipDuplicates: true,
    });
    // Новая строка уже защищена нашей транзакцией; отдельно блокируем только существующую.
    if (inserted) return { operation: inserted, created: true };
    const [operation] = await tx.$queryRaw<PostImageAttachmentOperation[]>`
      SELECT * FROM "post_image_attachment_operations"
      WHERE "id" = ${params.operationId}::uuid FOR UPDATE
    `;
    if (!operation) throw new Error('Attachment operation disappeared inside its transaction');
    if (operation.userId !== params.userId || operation.fileIdsHash !== fileIdsHash) {
      throw new PostImageAttachmentConflictError();
    }
    return { operation, created: false };
  }

  async claimExpiredImageUploads(params: ClaimExpiredImageUploadsParams): Promise<ClaimedImageUpload[]> {
    const { pendingExpiredBefore, completedBefore, rejectedBefore, retryBefore, claimedAt, limit } = params;

    // Prisma с limit проверяет статус только в подзапросе: пока UPDATE ждёт блокировку,
    // файл может стать ATTACHED и всё равно попасть под удаление. FOR UPDATE SKIP LOCKED
    // защищает выбранные строки от этой гонки и пропускает занятые; Prisma его не поддерживает.
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
            AND "postImageAttachmentOperationId" IS NULL)
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
    return this.prisma.file.findFirst({
      where: {
        id,
        deletedAt: null,
        uploadStatus: FileUploadStatus.ATTACHED,
      },
      select: {
        id: true,
        objectKey: true,
        userId: true,
      },
    });
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
        userId,
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
      const existing = await client.file.findFirst({
        where: { id: fileId, userId, deletedAt: null },
        select: { id: true },
      });
      if (existing) throw new ImageUploadStateConflictError();
    }
    return files;
  }
}
