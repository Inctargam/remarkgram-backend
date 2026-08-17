import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { MAX_IMAGES_PER_UPLOAD_REQUEST, MIN_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import {
  DuplicateImageUploadIdError,
  ImageUploadMetadataMismatchError,
  ImageUploadNotFoundError,
  InvalidImageCountError,
  InvalidImageUploadStatusError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import { FilesRepository, type ImageUploadRecord } from '../../ports/files.repository.js';
import { ObjectStorage } from '../../ports/object-storage.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';

export type CompleteImageUploadsParams = {
  userId: number;
  uploadIds: readonly string[];
};

export class CompleteImageUploadsCommand extends Command<void> {
  constructor(public readonly params: CompleteImageUploadsParams) {
    super();
  }
}

@CommandHandler(CompleteImageUploadsCommand)
export class CompleteImageUploadsUseCase implements ICommandHandler<CompleteImageUploadsCommand> {
  private readonly logger = new Logger(CompleteImageUploadsUseCase.name);

  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(command: CompleteImageUploadsCommand) {
    const { userId, uploadIds } = command.params;

    // После преобразования userId из транспортной строки application-слой принимает
    // только положительное целое, независимо от используемого транспорта и хранилища.
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    if (
      uploadIds.length < MIN_IMAGES_PER_UPLOAD_REQUEST ||
      uploadIds.length > MAX_IMAGES_PER_UPLOAD_REQUEST
    ) {
      throw new InvalidImageCountError();
    }

    if (new Set(uploadIds).size !== uploadIds.length) {
      throw new DuplicateImageUploadIdError();
    }

    const fileRecords = await this.filesRepository.findImageUploads({ uploadIds, userId });

    if (fileRecords.length !== uploadIds.length) {
      throw new ImageUploadNotFoundError();
    }

    // Повторное подтверждение уже завершённого набора считается успешным. Это делает операцию
    // идемпотентной, если предыдущий HTTP/gRPC-ответ потерялся и клиент повторил запрос.
    if (fileRecords.every((fileRecord) => fileRecord.uploadStatus === FileUploadStatus.COMPLETED)) {
      return;
    }

    // Для новой проверки весь набор должен находиться в PENDING. Сессии со статусом REJECTED
    // больше нельзя подтвердить, а смешанные статусы не образуют одну корректную попытку завершения.
    if (fileRecords.some((fileRecord) => fileRecord.uploadStatus !== FileUploadStatus.PENDING)) {
      throw new InvalidImageUploadStatusError();
    }

    const uploads = await Promise.all(
      fileRecords.map(async (fileRecord) => ({
        fileRecord,
        metadata: await this.objectStorage.getObjectMetadata(fileRecord.objectKey),
      })),
    );

    const hasMetadataMismatch = uploads.some(
      ({ fileRecord, metadata }) =>
        metadata === null ||
        metadata.size !== fileRecord.size ||
        metadata.contentType !== fileRecord.contentType,
    );

    await this.filesRepository.updateImageUploadsStatusIfAllPending({
      uploadIds,
      userId,
      uploadStatus: hasMetadataMismatch ? FileUploadStatus.REJECTED : FileUploadStatus.COMPLETED,
      uploadedAt: hasMetadataMismatch ? null : new Date(),
    });

    if (hasMetadataMismatch) {
      // Ответ клиенту не ждёт удаления из S3. REJECTED остаётся надёжным маркером для cron,
      // если эта best-effort попытка не завершится или процесс остановится после ответа.
      void this.deleteRejectedImageUploads(fileRecords, userId).catch((error: unknown) => {
        this.logger.error(
          'Immediate cleanup of rejected image uploads failed; scheduled cleanup will retry',
          error instanceof Error ? error.stack : String(error),
        );
      });

      throw new ImageUploadMetadataMismatchError();
    }
  }

  private async deleteRejectedImageUploads(
    fileRecords: readonly ImageUploadRecord[],
    userId: number,
  ): Promise<void> {
    await Promise.all(fileRecords.map(({ objectKey }) => this.objectStorage.deleteObject(objectKey)));
    await this.filesRepository.deleteRejectedImageUploads({
      uploadIds: fileRecords.map(({ id }) => id),
      userId,
    });
  }
}
