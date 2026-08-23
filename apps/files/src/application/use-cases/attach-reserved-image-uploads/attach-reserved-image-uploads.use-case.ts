import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import {
  InvalidImageUploadOperationIdError,
  InvalidImageUploadReservationIdError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';

export type AttachReservedImageUploadsParams = {
  userId: number;
  reservationId: string;
  operationId: string;
};

export class AttachReservedImageUploadsCommand extends Command<void> {
  constructor(public readonly params: AttachReservedImageUploadsParams) {
    super();
  }
}

@CommandHandler(AttachReservedImageUploadsCommand)
export class AttachReservedImageUploadsUseCase implements ICommandHandler<AttachReservedImageUploadsCommand> {
  constructor(private readonly filesRepository: FilesRepository) {}

  async execute(command: AttachReservedImageUploadsCommand) {
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

    await this.filesRepository.attachReservedImageUploads({ userId, reservationId, operationId });
  }
}
