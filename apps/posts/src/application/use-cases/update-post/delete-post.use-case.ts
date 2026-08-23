import { Command } from '@nestjs/cqrs';

type DeletePostParams = {
  postId: number;
  authorId: number;
};

export class DeletePostCommand extends Command<void> {
  // TODO: При реализации UC-3 не считать пост с publishedAt равным null опубликованным постом пользователя.
  constructor(public params: DeletePostParams) {
    super();
  }
}
