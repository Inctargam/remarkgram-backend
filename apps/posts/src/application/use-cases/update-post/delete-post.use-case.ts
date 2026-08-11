import { Command } from '@nestjs/cqrs';

type DeletePostParams = {
  postId: number;
  authorId: number;
};

export class DeletePostCommand extends Command<void> {
  constructor(public params: DeletePostParams) {
    super();
  }
}
