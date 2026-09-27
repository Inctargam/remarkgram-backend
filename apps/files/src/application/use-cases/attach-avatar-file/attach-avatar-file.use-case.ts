import { MAX_AVATAR_SIZE_BYTES } from '@app/files-grpc';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidUserIdError } from '../../errors/image-upload.errors.js';
import { validateImageUploadMetadata } from '../../policies/validate-image-upload-metadata.js';
import { FilesRepository, type AttachAvatarFileRepositoryParams } from '../../ports/files.repository.js';
import { UnitOfWork } from '../../ports/unit-of-work.js';

export class AttachAvatarFileCommand extends Command<void> {
  constructor(public readonly params: AttachAvatarFileRepositoryParams) {
    super();
  }
}

@CommandHandler(AttachAvatarFileCommand)
export class AttachAvatarFileUseCase implements ICommandHandler<AttachAvatarFileCommand> {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute({ params }: AttachAvatarFileCommand): Promise<void> {
    if (!Number.isSafeInteger(params.userId) || params.userId <= 0) throw new InvalidUserIdError();
    await this.unitOfWork.run(async (ctx) => {
      const file = await this.filesRepository.attachAvatarFile(params, ctx);
      // Ошибка проверки откатывает статус файла и avatarAttachmentOperationId.
      // При точном повторе файл уже проверен в исходной транзакции.
      if (file) validateImageUploadMetadata(file, MAX_AVATAR_SIZE_BYTES);
    });
  }
}
