import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import {
  InvalidImageUploadOperationIdError,
  InvalidImageUploadReservationIdError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';

export type ReleaseReservedImageUploadsParams = {
  userId: number;
  reservationId: string;
  operationId: string;
};

export class ReleaseReservedImageUploadsCommand extends Command<void> {
  constructor(public readonly params: ReleaseReservedImageUploadsParams) {
    super();
  }
}

@CommandHandler(ReleaseReservedImageUploadsCommand)
export class ReleaseReservedImageUploadsUseCase implements ICommandHandler<ReleaseReservedImageUploadsCommand> {
  constructor(private readonly filesRepository: FilesRepository) {}

  async execute(command: ReleaseReservedImageUploadsCommand) {
    const { userId, reservationId, operationId } = command.params;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    if (!isUUID(reservationId)) {
      throw new InvalidImageUploadReservationIdError();
    }

    if (!isUUID(operationId)) {
      throw new InvalidImageUploadOperationIdError();
    }

    await this.filesRepository.releaseReservedImageUploads({ userId, reservationId, operationId });
  }
}
