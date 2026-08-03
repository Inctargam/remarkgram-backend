import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

export type CompleteImageUploadsParams = {
  userId: number;
  uploadIds: readonly string[];
};

export class CompleteImageUploadsCommand extends Command<void> {
  constructor(public readonly params: CompleteImageUploadsParams) {
    super();
  }
}

@CommandHandler(CompleteImageUploadsCommand)
export class CompleteImageUploadsUseCase implements ICommandHandler<CompleteImageUploadsCommand> {
  // TODO: Verify the objects in storage and mark their file records as completed.
  execute() {
    return Promise.resolve();
  }
}
