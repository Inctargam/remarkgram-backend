import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  MAX_IMAGES_PER_UPLOAD_REQUEST,
  MAX_IMAGE_SIZE_BYTES,
  MIN_IMAGES_PER_UPLOAD_REQUEST,
} from '@app/files-grpc';
import {
  DuplicateClientFileIdError,
  InvalidImageCountError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import { validateImageUploadMetadata } from '../../policies/validate-image-upload-metadata.js';
import { ImageUploadSessionsService } from '../../services/image-upload-sessions.service.js';
import type { ImageUploadMetadataInput, ImageUploadSession } from '../../types/image-upload.types.js';

export type InitiateImageUploadsParams = {
  userId: number;
  images: readonly ImageUploadMetadataInput[];
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
  constructor(private readonly uploadSessionsService: ImageUploadSessionsService) {}
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
      validateImageUploadMetadata(image, MAX_IMAGE_SIZE_BYTES);

      if (clientFileIds.has(image.clientFileId)) {
        throw new DuplicateClientFileIdError(image.clientFileId);
      }

      clientFileIds.add(image.clientFileId);
    }

    return { sessions: await this.uploadSessionsService.create(userId, images) };
  }
}
