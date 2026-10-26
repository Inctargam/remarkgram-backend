import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import { InvalidAvatarFileIdError, InvalidIdempotencyKeyError } from '../errors/avatar.errors.js';
import { InvalidUserIdError } from '../errors/users.errors.js';
import { SetAvatarWorkflow, type SetAvatarParams } from '../ports/set-avatar.workflow.js';

export class SetAvatarCommand extends Command<void> {
  constructor(public readonly params: SetAvatarParams) {
    super();
  }
}

@CommandHandler(SetAvatarCommand)
export class SetAvatarUseCase implements ICommandHandler<SetAvatarCommand> {
  constructor(private readonly workflow: SetAvatarWorkflow) {}

  async execute({ params }: SetAvatarCommand): Promise<void> {
    if (!Number.isSafeInteger(params.userId) || params.userId <= 0) {
      throw new InvalidUserIdError();
    }
    if (!isUUID(params.fileId, '4')) {
      throw new InvalidAvatarFileIdError();
    }
    if (!isUUID(params.idempotencyKey, '4')) {
      throw new InvalidIdempotencyKeyError();
    }

    await this.workflow.execute({
      userId: params.userId,
      fileId: params.fileId.toLowerCase(),
      workflowId: `set-avatar:${params.userId}:${params.idempotencyKey.toLowerCase()}`,
    });
  }
}
