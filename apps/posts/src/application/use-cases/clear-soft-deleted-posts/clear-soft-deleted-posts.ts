import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PostsRepository } from '../../ports/posts.repository.js';
import { Logger } from '@nestjs/common';
import { clearSoftDeletedPostsPolicy } from './clear-soft-deleted-posts.policy.js';

class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ClearSorfDeletedPostsCommand extends Command<void> {
  constructor(public batchLimit: number) {
    super();
  }
}

@CommandHandler(ClearSorfDeletedPostsCommand)
export class ClearSorfDeletedPostsUseCase implements ICommandHandler<ClearSorfDeletedPostsCommand> {
  private readonly logger = new Logger(ClearSorfDeletedPostsUseCase.name);
  constructor(private readonly repository: PostsRepository) {}
  async execute({ batchLimit }: ClearSorfDeletedPostsCommand) {
    const limit = Number(batchLimit);
    try {
      if (!Number.isSafeInteger(limit)) {
        throw new InvalidInputError('batchLimit must be a safe integer');
      }
      if (limit < clearSoftDeletedPostsPolicy.minLimit || limit > clearSoftDeletedPostsPolicy.maxLimit) {
        throw new InvalidInputError(
          `batchLimit must be between ${clearSoftDeletedPostsPolicy.minLimit} and ${clearSoftDeletedPostsPolicy.maxLimit}, current value: ${limit}`,
        );
      }
      const number = await this.repository.clearSoftDeleted(limit);
      this.logger.debug(`Deleted ${number} posts`);
    } catch (error) {
      if (error instanceof InvalidInputError) {
        this.logger.error('Invalid input', error.message);
        return;
      }
      this.logger.error('Failed to purge expired posts', error);
    }
  }
}
