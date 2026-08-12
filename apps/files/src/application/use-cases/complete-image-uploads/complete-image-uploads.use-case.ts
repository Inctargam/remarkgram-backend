import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MAX_IMAGES_PER_UPLOAD_REQUEST, MIN_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import {
  DuplicateImageUploadIdError,
  ImageUploadMetadataMismatchError,
  ImageUploadNotFoundError,
  InvalidImageCountError,
  InvalidImageUploadStatusError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';
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
    if (fileRecords.every(({ uploadStatus }) => uploadStatus === FileUploadStatus.COMPLETED)) {
      return;
    }

    // Для новой проверки весь набор должен находиться в PENDING. Сессии со статусом REJECTED
    // больше нельзя подтвердить, а смешанные статусы не образуют одну корректную попытку завершения.
    if (fileRecords.some(({ uploadStatus }) => uploadStatus !== FileUploadStatus.PENDING)) {
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
      throw new ImageUploadMetadataMismatchError();
    }
  }
}
