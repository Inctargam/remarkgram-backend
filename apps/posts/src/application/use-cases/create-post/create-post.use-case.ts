import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH, MIN_IMAGES_PER_POST } from '@app/posts-grpc';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import {
  DuplicatePostImageIdError,
  InvalidPostDescriptionError,
  InvalidPostImageCountError,
  InvalidUserIdError,
} from '../../errors/create-post.errors.js';
import { ImageUploadsGateway } from '../../ports/image-uploads.gateway.js';
import { PostsRepository } from '../../ports/posts.repository.js';
import type { CreatePostResult } from '../../types/posts.types.js';

export type CreatePostParams = {
  userId: number;
  description?: string;
  imageIds: readonly string[];
};

export class CreatePostCommand extends Command<CreatePostResult> {
  constructor(public readonly params: CreatePostParams) {
    super();
  }
}

@CommandHandler(CreatePostCommand)
export class CreatePostUseCase implements ICommandHandler<CreatePostCommand> {
  private readonly logger = new Logger(CreatePostUseCase.name);

  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly imageUploadsGateway: ImageUploadsGateway,
  ) {}

  async execute(command: CreatePostCommand) {
    const { userId, description, imageIds } = command.params;

    // После преобразования userId из транспортной строки application-слой принимает
    // только положительное целое, независимо от используемого транспорта и хранилища.
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    if (description !== undefined && description.length > MAX_POST_DESCRIPTION_LENGTH) {
      throw new InvalidPostDescriptionError();
    }

    if (imageIds.length < MIN_IMAGES_PER_POST || imageIds.length > MAX_IMAGES_PER_POST) {
      throw new InvalidPostImageCountError();
    }

    if (new Set(imageIds).size !== imageIds.length) {
      throw new DuplicatePostImageIdError();
    }

    const reservationId = crypto.randomUUID();
    await this.imageUploadsGateway.reserveImageUploads({ reservationId, imageIds, userId });

    let postId: number;

    try {
      postId = await this.postsRepository.create({
        authorId: userId,
        description: description ?? null,
        imageIds,
      });
    } catch (error) {
      try {
        await this.imageUploadsGateway.releaseReservedImageUploads({ userId, reservationId });
      } catch (releaseError) {
        // Compensation is best effort: an unavailable Files service must not hide
        // the original post persistence error returned to the caller.
        this.logger.error('Failed to release image upload reservation after post creation failed', {
          reservationId,
          error: releaseError,
        });
      }

      throw error;
    }

    await this.imageUploadsGateway.attachReservedImageUploads({ userId, reservationId });

    return { id: postId };
  }
}
