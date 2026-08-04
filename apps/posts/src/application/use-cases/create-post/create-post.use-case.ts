import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH, MIN_IMAGES_PER_POST } from '@app/posts-grpc';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  DuplicatePostImageIdError,
  InvalidPostDescriptionError,
  InvalidPostImageCountError,
  InvalidUserIdError,
} from '../../errors/create-post.errors.js';
import { ImageUploadsVerifier } from '../../ports/image-uploads-verifier.js';
import { PostsRepository } from '../../ports/posts.repository.js';
import type { CreatePostResult } from '../../types/posts.types.js';

const MAX_USER_ID = 2_147_483_647;

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
  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly imageUploadsVerifier: ImageUploadsVerifier,
  ) {}

  async execute(command: CreatePostCommand) {
    const { userId, description, imageIds } = command.params;

    if (!Number.isSafeInteger(userId) || userId <= 0 || userId > MAX_USER_ID) {
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

    await this.imageUploadsVerifier.ensureCompleted({ userId, imageIds });

    const id = await this.postsRepository.create({
      authorId: userId,
      description: description ?? null,
      imageIds,
    });

    return { id };
  }
}
