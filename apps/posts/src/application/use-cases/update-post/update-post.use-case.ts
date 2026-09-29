import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PostsRepository } from '../../ports/posts.repository.js';
import { MAX_POST_DESCRIPTION_LENGTH } from '@app/posts-grpc';
import { InvalidPostDescriptionError, InvalidUserIdError } from '../../errors/create-post.errors.js';
import { PostUpdateForbiddenError } from '../../errors/update-post.errors.js';
import { InvalidPostIdError, PostNotFoundError } from '../../errors/base-post.errors.js';
import { isValidNumericEntityId } from '@app/validation';

type UpdatePostParams = {
  postId: number;
  authorId: number;
  description: string;
};

export class UpdatePostCommand extends Command<void> {
  constructor(public params: UpdatePostParams) {
    super();
  }
}

@CommandHandler(UpdatePostCommand)
export class UpdatePostUseCase implements ICommandHandler<UpdatePostCommand> {
  constructor(private readonly postsRepository: PostsRepository) {}
  async execute(command: UpdatePostCommand): Promise<void> {
    const { postId, authorId, description } = command.params;

    if (!isValidNumericEntityId(postId)) {
      throw new InvalidPostIdError();
    }

    if (!isValidNumericEntityId(authorId)) {
      throw new InvalidUserIdError();
    }

    const normalizedDescription = description.trim();
    if (normalizedDescription.length > MAX_POST_DESCRIPTION_LENGTH) {
      throw new InvalidPostDescriptionError();
    }

    const post = await this.postsRepository.findById(postId);
    if (!post) {
      throw new PostNotFoundError();
    }
    const isOwner = Number(post.authorId) === Number(authorId);
    if (!isOwner) {
      throw new PostUpdateForbiddenError();
    }

    await this.postsRepository.updateAuthorPost({
      id: postId,
      authorId: authorId,
      expectedVersion: post.version,
      fields: {
        description: normalizedDescription,
      },
    });
  }
}
