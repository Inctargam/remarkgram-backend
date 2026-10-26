import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { FilesRepository, type PostImageAttachmentParams } from '../../ports/files.repository.js';
import { validatePostImageAttachment } from '../../helpers/validate-post-image-attachment.js';

export class AttachPostImagesCommand extends Command<void> {
  constructor(public readonly params: PostImageAttachmentParams) {
    super();
  }
}

@CommandHandler(AttachPostImagesCommand)
export class AttachPostImagesUseCase implements ICommandHandler<AttachPostImagesCommand> {
  constructor(private readonly filesRepository: FilesRepository) {}

  async execute(command: AttachPostImagesCommand): Promise<void> {
    validatePostImageAttachment(command.params);
    await this.filesRepository.attachPostImages(command.params);
  }
}
