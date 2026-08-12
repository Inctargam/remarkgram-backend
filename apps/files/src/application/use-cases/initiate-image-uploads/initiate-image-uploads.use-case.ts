import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import {
  ImageContentType,
  MAX_IMAGES_PER_UPLOAD_REQUEST,
  MAX_IMAGE_SIZE_BYTES,
  MIN_IMAGES_PER_UPLOAD_REQUEST,
  MIN_IMAGE_SIZE_BYTES,
} from '@app/files-grpc';
import {
  DuplicateClientFileIdError,
  InvalidImageSizeError,
  InvalidImageCountError,
  InvalidUserIdError,
  UnsupportedImageContentTypeError,
} from '../../errors/image-upload.errors.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import { FilesRepository, type CreateFileRecord } from '../../ports/files.repository.js';
import { ObjectStorage } from '../../ports/object-storage.js';

const supportedImageContentTypes = new Set<string>(Object.values(ImageContentType));
const IMAGE_UPLOAD_TTL_SECONDS = 300;
export type ImageUploadMetadataInput = {
  clientFileId: string;
  originalFilename: string;
  contentType: string;
  size: number;
};

export type InitiateImageUploadsParams = {
  userId: number;
  images: readonly ImageUploadMetadataInput[];
};

export type ImageUploadSession = {
  id: string;
  clientFileId: string;
  url: string;
  fields: Record<string, string>;
};

export type InitiateImageUploadsResult = {
  sessions: ImageUploadSession[];
};

export class InitiateImageUploadsCommand extends Command<InitiateImageUploadsResult> {
  constructor(public readonly params: InitiateImageUploadsParams) {
    super();
  }
}

@CommandHandler(InitiateImageUploadsCommand)
export class InitiateImageUploadsUseCase implements ICommandHandler<InitiateImageUploadsCommand> {
  constructor(
    private readonly objectStorage: ObjectStorage,
    private readonly filesRepository: FilesRepository,
  ) {}
  async execute(command: InitiateImageUploadsCommand) {
    const { userId, images } = command.params;

    // После преобразования userId из транспортной строки application-слой принимает
    // только положительное целое, независимо от используемого транспорта и хранилища.
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    if (images.length < MIN_IMAGES_PER_UPLOAD_REQUEST || images.length > MAX_IMAGES_PER_UPLOAD_REQUEST) {
      throw new InvalidImageCountError();
    }

    const clientFileIds = new Set<string>();

    for (const image of images) {
      if (
        !Number.isSafeInteger(image.size) ||
        image.size < MIN_IMAGE_SIZE_BYTES ||
        image.size > MAX_IMAGE_SIZE_BYTES
      ) {
        throw new InvalidImageSizeError();
      }

      if (!supportedImageContentTypes.has(image.contentType)) {
        throw new UnsupportedImageContentTypeError(image.contentType);
      }

      if (clientFileIds.has(image.clientFileId)) {
        throw new DuplicateClientFileIdError(image.clientFileId);
      }

      clientFileIds.add(image.clientFileId);
    }

    const imageUploadSessions: ImageUploadSession[] = [];
    const fileRecords: CreateFileRecord[] = [];

    for (const image of images) {
      const { originalFilename, contentType, size } = image;
      const id = randomUUID();
      const objectKey = `user/${userId}/images/${id}`;

      const { url, fields, expiresAt } = await this.objectStorage.createPresignedUpload({
        objectKey,
        contentType,
        size,
        expiresInSeconds: IMAGE_UPLOAD_TTL_SECONDS,
      });

      const uploadSession = {
        id,
        clientFileId: image.clientFileId,
        url,
        fields,
      };

      const fileRecord = {
        id,
        userId,
        objectKey,
        originalFilename,
        contentType,
        size,
        uploadStatus: FileUploadStatus.PENDING,
        uploadExpiresAt: expiresAt,
      };

      fileRecords.push(fileRecord);
      imageUploadSessions.push(uploadSession);
    }

    await this.filesRepository.createMany(fileRecords);

    return { sessions: imageUploadSessions };
  }
}
