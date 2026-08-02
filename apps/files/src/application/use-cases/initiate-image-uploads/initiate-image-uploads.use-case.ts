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
  InvalidImageSizeError,
  InvalidImageCountError,
  UnsupportedImageContentTypeError,
} from '../../errors/image-upload.errors.js';

const supportedImageContentTypes = new Set<string>(Object.values(ImageContentType));

export type ImageUploadMetadataInput = {
  originalFilename: string;
  contentType: string;
  size: number;
};

export type InitiateImageUploadsParams = {
  userId: string;
  images: readonly ImageUploadMetadataInput[];
};

export type InitiateImageUploadsResult = {
  sessions: { id: string }[];
};

export class InitiateImageUploadsCommand extends Command<InitiateImageUploadsResult> {
  constructor(public readonly params: InitiateImageUploadsParams) {
    super();
  }
}

@CommandHandler(InitiateImageUploadsCommand)
export class InitiateImageUploadsUseCase implements ICommandHandler<InitiateImageUploadsCommand> {
  execute(command: InitiateImageUploadsCommand) {
    const { images } = command.params;

    if (images.length < MIN_IMAGES_PER_UPLOAD_REQUEST || images.length > MAX_IMAGES_PER_UPLOAD_REQUEST) {
      throw new InvalidImageCountError();
    }

    for (const image of images) {
      if (image.size < MIN_IMAGE_SIZE_BYTES || image.size > MAX_IMAGE_SIZE_BYTES) {
        throw new InvalidImageSizeError();
      }

      if (!supportedImageContentTypes.has(image.contentType)) {
        throw new UnsupportedImageContentTypeError(image.contentType);
      }
    }

    return Promise.resolve({
      sessions: images.map(() => ({ id: randomUUID() })),
    });
  }
}
