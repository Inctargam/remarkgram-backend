import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MAX_IMAGES_PER_UPLOAD_REQUEST, MIN_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import { isUUID } from 'class-validator';
import {
  DuplicateImageUploadIdError,
  InvalidImageCountError,
  InvalidImageUploadIdError,
  InvalidImageUploadOperationIdError,
  InvalidImageUploadReservationIdError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';

const IMAGE_UPLOAD_RESERVATION_TTL_MS = 5 * 60 * 1_000;

export type ReserveImageUploadsParams = {
  userId: number;
  uploadIds: readonly string[];
  reservationId: string;
  operationId: string;
};

export class ReserveImageUploadsCommand extends Command<void> {
  constructor(public readonly params: ReserveImageUploadsParams) {
    super();
  }
}

@CommandHandler(ReserveImageUploadsCommand)
export class ReserveImageUploadsUseCase implements ICommandHandler<ReserveImageUploadsCommand> {
  constructor(private readonly filesRepository: FilesRepository) {}

  async execute(command: ReserveImageUploadsCommand) {
    const { userId, uploadIds, reservationId, operationId } = command.params;

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

    // Files также является самостоятельной gRPC-границей, поэтому нельзя полагаться только
    // на HTTP DTO шлюза: иначе некорректный UUID превратится в INTERNAL-ошибку PostgreSQL.
    if (uploadIds.some((uploadId) => !isUUID(uploadId))) {
      throw new InvalidImageUploadIdError();
    }

    if (!isUUID(reservationId)) {
      throw new InvalidImageUploadReservationIdError();
    }

    if (!isUUID(operationId)) {
      throw new InvalidImageUploadOperationIdError();
    }

    await this.filesRepository.reserveImageUploads({
      userId,
      uploadIds,
      reservationId,
      operationId,
      reservationExpiresAt: new Date(Date.now() + IMAGE_UPLOAD_RESERVATION_TTL_MS),
    });
  }
}
