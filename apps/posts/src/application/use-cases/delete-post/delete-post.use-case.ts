import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PostsRepository } from '../../ports/posts.repository.js';
import { isValidNumericEntityId } from '@app/validation';
import { InvalidUserIdError } from '../../errors/create-post.errors.js';
import { InvalidPostIdError, PostAccessForbiddenError } from '../../errors/base-post.errors.js';
import { UnitOfWork } from '../../ports/unit-of-work.js';
import { OutboxEventsRepository } from '../../ports/outbox-events.repository.js';
import { PostDeletedV1Factory } from '../../integration-events/post-deleted-v1/post-deleted-v1.factory.js';
import { DeletedPostsPublisherWorker } from '../../workers/deleted-posts-publisher.worker.js';
import { worker } from 'globals';

type DeletePostParams = {
  postId: number;
  authorId: number;
};

export class DeletePostCommand extends Command<void> {
  constructor(public params: DeletePostParams) {
    super();
  }
}

@CommandHandler(DeletePostCommand)
export class DeletePostUseCase implements ICommandHandler<DeletePostCommand> {
  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly outbox: OutboxEventsRepository,
    private readonly worker: DeletedPostsPublisherWorker,
  ) {}
  async execute(command: DeletePostCommand) {
    const { postId, authorId } = command.params;

    if (!isValidNumericEntityId(authorId)) {
      throw new InvalidUserIdError();
    }
    if (!isValidNumericEntityId(postId)) {
      throw new InvalidPostIdError();
    }
    const post = await this.postsRepository.findById(postId);
    if (!post) {
      // DELETE is idempotent: an absent or already deleted post is the desired final state.
      return;
    }
    // Ownership must be checked before deletion so an existing post owned by another user
    // is not indistinguishable from an absent post.
    if (Number(post.authorId) !== Number(authorId)) {
      throw new PostAccessForbiddenError();
    }
    await this.unitOfWork.run(async (ctx) => {
      const resultDeleted = await this.postsRepository.softDeleteById(
        {
          id: postId,
          authorId: authorId,
        },
        ctx,
      );
      // The post can disappear between findById and the conditional update. This is an
      // expected concurrent/idempotent outcome, so no deletion event should be emitted.
      if (!resultDeleted) {
        return;
      }

      const integrationEvent = PostDeletedV1Factory.create({
        postId: resultDeleted.id,
        authorId: resultDeleted.authorId,
        deletedAt: resultDeleted.deletedAt,
        fileIds: resultDeleted.filedIds,
      });
      await this.outbox.add(integrationEvent, ctx);
    });
    this.worker.run().catch();
    return;
  }
}
