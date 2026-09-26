import { createHash } from 'node:crypto';
import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH, MIN_IMAGES_PER_POST } from '@app/posts-grpc';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  DuplicatePostImageIdError,
  InvalidPostDescriptionError,
  InvalidPostIdempotencyKeyError,
  InvalidPostImageCountError,
  InvalidUserIdError,
} from '../../errors/create-post.errors.js';
import { CreatePostWorkflow } from '../../ports/create-post.workflow.js';
import type { CreatePostResult } from '../../types/posts.types.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreatePostParams = {
  userId: number;
  idempotencyKey: string;
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
  constructor(private readonly createPostWorkflow: CreatePostWorkflow) {}

  async execute(command: CreatePostCommand): Promise<CreatePostResult> {
    const { userId, description, imageIds } = command.params;
    const idempotencyKey = command.params.idempotencyKey.toLowerCase();
    const canonicalImageIds = imageIds.map((imageId) => imageId.toLowerCase());

    // После преобразования userId из транспортной строки application-слой принимает
    // только положительное целое, независимо от используемого транспорта и хранилища.
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidUserIdError();
    }

    if (!UUID_V4_PATTERN.test(idempotencyKey)) {
      throw new InvalidPostIdempotencyKeyError();
    }

    if (description !== undefined && description.length > MAX_POST_DESCRIPTION_LENGTH) {
      throw new InvalidPostDescriptionError();
    }

    if (imageIds.length < MIN_IMAGES_PER_POST || imageIds.length > MAX_IMAGES_PER_POST) {
      throw new InvalidPostImageCountError();
    }

    if (new Set(canonicalImageIds).size !== canonicalImageIds.length) {
      throw new DuplicatePostImageIdError();
    }

    const postDescription = description ?? null;
    // Хеш строится из канонического представления бизнес-запроса. Порядок imageIds
    // сохраняется, потому что он определяет порядок изображений в публикации.
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ description: postDescription, imageIds: canonicalImageIds }))
      .digest('hex');

    return this.createPostWorkflow.execute({
      workflowId: `create-post:${userId}:${idempotencyKey}`,
      requestHash,
      userId,
      description: postDescription,
      imageIds: canonicalImageIds,
    });
  }
}
