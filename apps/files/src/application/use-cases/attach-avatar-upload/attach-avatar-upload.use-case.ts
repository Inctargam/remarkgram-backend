import { MAX_AVATAR_SIZE_BYTES } from '@app/files-grpc';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidUserIdError } from '../../errors/image-upload.errors.js';
import { validateImageUploadMetadata } from '../../policies/validate-image-upload-metadata.js';
import { FilesRepository, type AttachImageUploadRepositoryParams } from '../../ports/files.repository.js';
import { UnitOfWork } from '../../ports/unit-of-work.js';

export class AttachAvatarUploadCommand extends Command<void> {
  constructor(public readonly params: AttachImageUploadRepositoryParams) {
    super();
  }
}

@CommandHandler(AttachAvatarUploadCommand)
export class AttachAvatarUploadUseCase implements ICommandHandler<AttachAvatarUploadCommand> {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute({ params }: AttachAvatarUploadCommand): Promise<void> {
    if (!Number.isSafeInteger(params.userId) || params.userId <= 0) throw new InvalidUserIdError();
    await this.unitOfWork.run(async (ctx) => {
      const file = await this.filesRepository.attachImageUpload(params, ctx);
      // Ошибка проверки откатывает статус файла и attachmentOperationId.
      // При точном повторе файл уже проверен в исходной транзакции.
      if (file) validateImageUploadMetadata(file, MAX_AVATAR_SIZE_BYTES);
    });
  }
}
