import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { FilesRepository, type PostImageAttachmentParams } from '../../ports/files.repository.js';
import { validatePostImageAttachment } from '../../helpers/validate-post-image-attachment.js';

export class CancelPostImageAttachmentCommand extends Command<void> {
  constructor(public readonly params: PostImageAttachmentParams) {
    super();
  }
}

@CommandHandler(CancelPostImageAttachmentCommand)
export class CancelPostImageAttachmentUseCase implements ICommandHandler<CancelPostImageAttachmentCommand> {
  constructor(private readonly filesRepository: FilesRepository) {}

  async execute(command: CancelPostImageAttachmentCommand): Promise<void> {
    validatePostImageAttachment(command.params);
    await this.filesRepository.cancelPostImageAttachment(command.params);
  }
}
