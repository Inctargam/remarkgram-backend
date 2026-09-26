import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidUserIdError } from '../../errors/image-upload.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';

export type AttachReservedImageUploadsParams = {
  userId: number;
  reservationId: string;
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
    const { userId, reservationId } = command.params;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    await this.filesRepository.attachReservedImageUploads({ userId, reservationId });
  }
}
