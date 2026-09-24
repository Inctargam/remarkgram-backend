import { AvatarDeletionRequestsRepository } from '../ports/avatar-deletion-requests.repository.js';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import { UnitOfWork } from '../../../../common/application/unit-of-work.js';
import { InvalidIdempotencyKeyError } from '../errors/avatar.errors.js';
import { InvalidUserIdError, UserNotFoundError } from '../errors/users.errors.js';
import { UsersRepository } from '../ports/users.repository.js';
import type { DeleteAvatarParams } from '../types/users.types.js';
import { AvatarDeletionOutbox } from '../ports/avatar-deletion.outbox.js';
import { createAvatarDeletionEvent } from '../integration-events/avatar-deletion-requested.event.js';

export class DeleteAvatarCommand extends Command<void> {
  constructor(public readonly params: DeleteAvatarParams) {
    super();
  }
}

@CommandHandler(DeleteAvatarCommand)
export class DeleteAvatarUseCase implements ICommandHandler<DeleteAvatarCommand> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly users: UsersRepository,
    private readonly deletionRequests: AvatarDeletionRequestsRepository,
    private readonly avatarDeletionOutbox: AvatarDeletionOutbox,
  ) {}

  async execute({ params }: DeleteAvatarCommand): Promise<void> {
    if (!Number.isSafeInteger(params.userId) || params.userId <= 0) throw new InvalidUserIdError();
    if (!isUUID(params.idempotencyKey, '4')) throw new InvalidIdempotencyKeyError();

    const request = { ...params, idempotencyKey: params.idempotencyKey.toLowerCase() };
    const event = await this.unitOfWork.run(async (ctx) => {
      if (!(await this.users.lockActiveById(params.userId, ctx))) throw new UserNotFoundError();
      // Старый DELETE не должен удалить аватар, установленный после первого запроса.
      if (await this.deletionRequests.exists(request, ctx)) return null;

      const previousAvatarFileId = await this.users.clearAvatar(params.userId, ctx);
      await this.deletionRequests.add(request, ctx);
      if (!previousAvatarFileId) return null;

      const event = createAvatarDeletionEvent(params.userId, previousAvatarFileId);
      await this.avatarDeletionOutbox.enqueue(event, ctx);

      return event;
    });
    // Транзакция уже завершена; сбой процесса здесь подхватит резервный опрос pg-boss.
    if (event) this.avatarDeletionOutbox.wake();
  }
}
