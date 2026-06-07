import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PostsRepository } from '../../ports/posts.repository.js';
import { Post } from '../../../domain/entities/post.entity.js';

export class CreatePostCommand extends Command<{
  id: number; // This type represents the command execution result
}> {
  constructor(
    public readonly title: string,
    public readonly content: string,
  ) {
    super();
  }
}

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(private postsRepository: PostsRepository) {}

  async execute(command: CreatePostCommand) {
    const newPost = Post.create(command);
    const persist = await this.postsRepository.create(newPost);

    return {
      id: persist.id as number,
    };
  }
}
