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
  InvalidImageUploadCountError,
  UnsupportedImageContentTypeError,
} from '../../errors/image-upload.errors.js';

const supportedImageContentTypes = new Set<string>(Object.values(ImageContentType));

export type ImageUploadMetadataInput = {
  originalFilename: string;
  contentType: string;
  size: number;
};

export type CreateImageUploadSessionsParams = {
  userId: string;
  images: readonly ImageUploadMetadataInput[];
};

export type CreateImageUploadSessionsResult = {
  uploads: { id: string }[];
};

export class CreateImageUploadSessionsCommand extends Command<CreateImageUploadSessionsResult> {
  constructor(public readonly params: CreateImageUploadSessionsParams) {
    super();
  }
}

@CommandHandler(CreateImageUploadSessionsCommand)
export class CreateImageUploadSessionsUseCase implements ICommandHandler<CreateImageUploadSessionsCommand> {
  execute(command: CreateImageUploadSessionsCommand): Promise<CreateImageUploadSessionsResult> {
    const { images } = command.params;

    if (images.length < MIN_IMAGES_PER_UPLOAD_REQUEST || images.length > MAX_IMAGES_PER_UPLOAD_REQUEST) {
      throw new InvalidImageUploadCountError();
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
      uploads: images.map(() => ({ id: randomUUID() })),
    });
  }
}
