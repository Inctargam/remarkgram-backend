import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MAX_AVATAR_SIZE_BYTES } from '@app/files-grpc';
import { InvalidUserIdError } from '../../errors/image-upload.errors.js';
import { validateImageUploadMetadata } from '../../policies/validate-image-upload-metadata.js';
import { ImageUploadSessionsService } from '../../services/image-upload-sessions.service.js';
import type { ImageUploadMetadataInput, ImageUploadSession } from '../../types/image-upload.types.js';

export type InitiateAvatarUploadParams = ImageUploadMetadataInput & { userId: number };

export class InitiateAvatarUploadCommand extends Command<ImageUploadSession> {
  constructor(public readonly params: InitiateAvatarUploadParams) {
    super();
  }
}

@CommandHandler(InitiateAvatarUploadCommand)
export class InitiateAvatarUploadUseCase implements ICommandHandler<InitiateAvatarUploadCommand> {
  constructor(private readonly uploadSessionsService: ImageUploadSessionsService) {}

  async execute(command: InitiateAvatarUploadCommand): Promise<ImageUploadSession> {
    const { userId, ...image } = command.params;
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    validateImageUploadMetadata(image, MAX_AVATAR_SIZE_BYTES);
    const [session] = await this.uploadSessionsService.create(userId, [image]);
    return session;
  }
}
